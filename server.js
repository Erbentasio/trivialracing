const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { customAlphabet } = require('nanoid');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
	cors: { origin: '*' }
});

app.use(express.static('public'));

const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 6);

// In-memory store (OK for prototype)
/** @type {Map<string, Room>} */
const rooms = new Map();

/**
 * @typedef {{ id: string, name: string, score: number }} Player
 * @typedef {{
 *  token: string,
 *  players: Player[],
 *  managerId: string | null,
 *  state: 'waiting' | 'in_progress' | 'results',
 *  currentQuestionIndex: number,
 *  questionStartTs: number | null,
 *  answers: Map<string, { option: string, ts: number, correct: boolean }>,
 *  timeouts: { question?: NodeJS.Timeout, cleanup?: NodeJS.Timeout, waitingExpiry?: NodeJS.Timeout },
 *  createdAt: number,
 * }} Room
 */

const QUESTIONS = [
	{
		id: 1,
		text: '¿Qué producto de Control de Miopía tiene el estudio más largo realizado en niños?',
		options: ['A) Lente Oftálmica', 'B) MiSight 1 day', 'C) Lentilla Multifocal', 'D) Orto-K'],
		correct: 'B'
	},
	{
		id: 2,
		text: '¿Cuál de estos productos ha demostrado su eficiacia en frenar la miopía en nios de 6 años?',
		options: ['A) MiSight 1 day', 'B) MiSight Spectacle', 'C) Orto-K', 'D) Todas las anteriores'],
		correct: 'B'
	}
];

const MAX_PLAYERS = 12;
const MIN_PLAYERS_TO_START = 1;
const QUESTION_TIME_SECONDS = 15;
const WAITING_GRACE_MS = 20 * 60 * 1000; // 20 minutos

io.on('connection', (socket) => {
	// Create a room
	socket.on('room:create', ({ name }, callback) => {
		const token = nanoid();
		const room = createRoom(token);
		rooms.set(token, room);
		joinRoom(socket, token, name, callback);
	});

	// Join existing room
	socket.on('room:join', ({ token, name }, callback) => {
		joinRoom(socket, token, name, callback);
	});

	// Start game (manager only)
	socket.on('game:start', ({ token }, callback) => {
		const room = rooms.get(token);
		if (!room) return callback?.({ ok: false, error: 'Sala no existe' });
		if (room.managerId !== socket.id) return callback?.({ ok: false, error: 'Solo el Manager puede iniciar' });
		if (room.state !== 'waiting') return callback?.({ ok: false, error: 'El juego ya inició' });
		if (room.players.length < MIN_PLAYERS_TO_START) return callback?.({ ok: false, error: 'Se requiere al menos 1 jugador' });
		startGame(token);
		callback?.({ ok: true });
	});

	// Submit answer
	socket.on('game:answer', ({ token, option }, callback) => {
		const room = rooms.get(token);
		if (!room || room.state !== 'in_progress') return callback?.({ ok: false });
		const hasPlayer = room.players.some(p => p.id === socket.id);
		if (!hasPlayer) return callback?.({ ok: false });
		// Only accept first answer per player per question
		if (room.answers.has(socket.id)) return callback?.({ ok: false, error: 'Respuesta ya enviada' });
		const now = Date.now();
		const optionUpper = String(option || '').trim().toUpperCase();
		const currentQ = QUESTIONS[room.currentQuestionIndex];
		const correct = optionUpper === currentQ.correct;
		// Ignore late answers (after time)
		if (!room.questionStartTs || (now - room.questionStartTs) > QUESTION_TIME_SECONDS * 1000) {
			return callback?.({ ok: false, error: 'Tiempo agotado' });
		}
		room.answers.set(socket.id, { option: optionUpper, ts: now, correct });
		callback?.({ ok: true });
		// Optionally, notify client that answer registered
		socket.emit('game:answer:ack', { ok: true });
	});

	// Restart to waiting (manager only)
	socket.on('game:restart', ({ token }, callback) => {
		const room = rooms.get(token);
		if (!room) return callback?.({ ok: false, error: 'Sala no existe' });
		if (room.managerId !== socket.id) return callback?.({ ok: false, error: 'Solo el Manager puede reiniciar' });
		resetToWaiting(room);
		io.to(token).emit('room:state', publicRoomState(room));
		callback?.({ ok: true });
	});

	// Disconnect
	socket.on('disconnect', () => {
		// Remove player from any room
		for (const [token, room] of rooms) {
			const before = room.players.length;
			room.players = room.players.filter(p => p.id !== socket.id);
			let changed = before !== room.players.length;
			// If manager left, reassign if anyone remains
			if (room.managerId === socket.id) {
				room.managerId = room.players[0]?.id || null;
				changed = true;
			}
			if (changed) {
				io.to(token).emit('room:state', publicRoomState(room));
			}
			// If room is empty, schedule clean up (avoid immediate deletion during page navigation)
			if (room.players.length === 0 && !room.timeouts.cleanup) {
				room.timeouts.cleanup = setTimeout(() => {
					clearRoomTimers(room);
					rooms.delete(token);
				}, 2 * 60 * 1000); // 2 minutes
			}
		}
	});
});

function createRoom(token) {
	return {
		token,
		players: [],
		managerId: null,
		state: 'waiting',
		currentQuestionIndex: -1,
		questionStartTs: null,
		answers: new Map(),
		timeouts: {},
		createdAt: Date.now()
	};
}

function joinRoom(socket, token, name, callback) {
	const room = rooms.get(token);
	if (!room) return callback?.({ ok: false, error: 'La sala no existe' });
	if (room.state !== 'waiting') return callback?.({ ok: false, error: 'La partida ya comenzó' });
	if (room.players.length >= MAX_PLAYERS) return callback?.({ ok: false, error: 'Sala llena (máx. 12)' });
	const player = { id: socket.id, name: sanitizeName(name), score: 0 };
	room.players.push(player);
	const wasWithoutManager = !room.managerId;
	if (!room.managerId) room.managerId = socket.id;
	socket.join(token);
	// If a cleanup was scheduled due to being empty, cancel it now that someone joined
	if (room.timeouts.cleanup) {
		clearTimeout(room.timeouts.cleanup);
		room.timeouts.cleanup = undefined;
	}
	// Ensure waiting expiry is scheduled after creation/reset (only while waiting)
	ensureWaitingExpiry(room);
	// Notify manager about grace window (only manager socket and only while waiting)
	if (room.managerId && (wasWithoutManager || room.managerId === socket.id) && room.state === 'waiting') {
		const expiresAt = (room.createdAt || Date.now()) + WAITING_GRACE_MS;
		io.to(room.managerId).emit('room:grace-info', {
			minutes: Math.round(WAITING_GRACE_MS / 60000),
			expiresAt
		});
	}
	io.to(token).emit('room:state', publicRoomState(room));
	callback?.({ ok: true, token, isManager: room.managerId === socket.id, player });
}

function publicRoomState(room) {
	return {
		token: room.token,
		state: room.state,
		players: room.players.map(p => ({ id: p.id, name: p.name, score: p.score })),
		managerId: room.managerId,
		currentQuestionIndex: room.currentQuestionIndex,
		questionStartTs: room.questionStartTs,
		timePerQuestion: QUESTION_TIME_SECONDS
	};
}

function sanitizeName(name) {
	const n = String(name || '').trim();
	if (n.length === 0) return 'Jugador';
	return n.slice(0, 24);
}

function startGame(token) {
	const room = rooms.get(token);
	if (!room) return;
	room.state = 'in_progress';
	room.currentQuestionIndex = -1;
	room.players.forEach(p => { p.score = 0; });
	// Cancel waiting expiry when game starts
	if (room.timeouts.waitingExpiry) {
		clearTimeout(room.timeouts.waitingExpiry);
		room.timeouts.waitingExpiry = undefined;
	}
	nextQuestion(room);
	io.to(token).emit('room:state', publicRoomState(room));
}

function nextQuestion(room) {
	clearRoomTimers(room);
	room.currentQuestionIndex += 1;
	room.answers = new Map();
	if (room.currentQuestionIndex >= QUESTIONS.length) {
		// End game
		room.state = 'results';
		room.questionStartTs = null;
		io.to(room.token).emit('game:results', {
			players: room.players
				.slice()
				.sort((a, b) => b.score - a.score)
		});
		io.to(room.token).emit('room:state', publicRoomState(room));
		return;
	}
	// Start question
	room.questionStartTs = Date.now();
	const q = QUESTIONS[room.currentQuestionIndex];
	io.to(room.token).emit('game:question', {
		index: room.currentQuestionIndex,
		total: QUESTIONS.length,
		question: {
			text: q.text,
			options: q.options
		},
		startTs: room.questionStartTs,
		durationSec: QUESTION_TIME_SECONDS
	});
	// Schedule end of question
	room.timeouts.question = setTimeout(() => endQuestion(room), QUESTION_TIME_SECONDS * 1000 + 50);
}

function endQuestion(room) {
	// Score answers based on order of correct responses
	const q = QUESTIONS[room.currentQuestionIndex];
	const correctAnswers = [];
	for (const [playerId, ans] of room.answers) {
		if (ans.correct) correctAnswers.push({ playerId, ts: ans.ts });
	}
	correctAnswers.sort((a, b) => a.ts - b.ts);
	const award = (rank) => {
		if (rank === 0) return 20;
		if (rank === 1) return 10;
		if (rank === 2) return 5;
		return 1;
	};
	correctAnswers.forEach((entry, idx) => {
		const player = room.players.find(p => p.id === entry.playerId);
		if (player) player.score += award(idx);
	});
	// Reveal correct option and who scored
	const scored = correctAnswers.map((e, idx) => ({
		playerId: e.playerId,
		points: award(idx)
	}));
	io.to(room.token).emit('game:question:end', {
		index: room.currentQuestionIndex,
		correct: q.correct,
		scored
	});
	// Move to next after short pause
	setTimeout(() => {
		nextQuestion(room);
		io.to(room.token).emit('room:state', publicRoomState(room));
	}, 1500);
}

function resetToWaiting(room) {
	clearRoomTimers(room);
	room.state = 'waiting';
	room.currentQuestionIndex = -1;
	room.questionStartTs = null;
	room.answers = new Map();
	room.players.forEach(p => { p.score = 0; });
	room.createdAt = Date.now();
	ensureWaitingExpiry(room);
	// Inform current manager about new grace window
	if (room.managerId) {
		const expiresAt = room.createdAt + WAITING_GRACE_MS;
		io.to(room.managerId).emit('room:grace-info', {
			minutes: Math.round(WAITING_GRACE_MS / 60000),
			expiresAt
		});
	}
}

function clearRoomTimers(room) {
	if (room.timeouts.question) {
		clearTimeout(room.timeouts.question);
		room.timeouts.question = undefined;
	}
	if (room.timeouts.cleanup) {
		clearTimeout(room.timeouts.cleanup);
		room.timeouts.cleanup = undefined;
	}
	if (room.timeouts.waitingExpiry) {
		clearTimeout(room.timeouts.waitingExpiry);
		room.timeouts.waitingExpiry = undefined;
	}
}

function ensureWaitingExpiry(room) {
	if (room.state !== 'waiting') return;
	// If already scheduled, keep existing schedule
	if (room.timeouts.waitingExpiry) return;
	// Ensure createdAt is set
	if (!room.createdAt) room.createdAt = Date.now();
	const now = Date.now();
	const target = room.createdAt + WAITING_GRACE_MS;
	const delay = Math.max(0, target - now);
	room.timeouts.waitingExpiry = setTimeout(() => {
		// Only expire if still waiting and not started
		if (room.state === 'waiting') {
			io.to(room.token).emit('room:expired', { reason: 'timeout' });
			clearRoomTimers(room);
			rooms.delete(room.token);
		}
	}, delay);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
	console.log(`Trivial Racing escuchando en http://localhost:${PORT}`);
});


