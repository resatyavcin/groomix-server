const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const EVENT_JOIN_ROOM = "join-room";
const EVENT_ROOM_USERS = "room-users";
const EVENT_SEND_SCORE = "send-score";
const EVENT_SCORE_UPDATE = "score-update";
const EVENT_RESET_SCORES = "reset-scores";
const EVENT_SHOW_ALL_SCORES = "show-all-scores";
const EVENT_DISCONNECT = "disconnect";

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" }, pingInterval: 2000, pingTimeout: 2300 });



const rooms = {};

io.on("connection", (socket) => {
  socket.on(EVENT_JOIN_ROOM, (payload) => handleJoinRoom(socket, payload));
  socket.on(EVENT_SEND_SCORE, (payload) => handleSendScore(socket, payload));
  socket.on(EVENT_RESET_SCORES, () => handleResetScores(socket));
    socket.on(EVENT_SHOW_ALL_SCORES, (payload) =>
        handleShowAllScores(socket, payload)
    );
    socket.on(EVENT_DISCONNECT, (payload) =>
        handleDisconnect(socket, payload)
    );
});

function handleShowAllScores(socket, { show }) {
  const { room } = socket.data;
  if (!room) return;
  io.to(room).emit("show-all-scores", show);
}

function handleResetScores(socket) {
  const { room } = socket.data;
  if (!room || !rooms[room]) return;

  for (const user of Object.values(rooms[room])) {
    user.selectedScore = null;
  }


  io.to(room).emit("show-all-scores", false);
  io.to(room).emit("room-users", Object.values(rooms[room]));
  io.to(room).emit("is-reset", true);

}

function handleJoinRoom(socket, { userId, room, name, isAdmin, deviceId }) {
    socket.join(room);
    socket.data = { room, name, isAdmin, deviceId, userId };
    if (!rooms[room]) {
        rooms[room] = {};
    }

    // 🔹 Aynı deviceId ile bağlanan eski kullanıcı var mı kontrol et
    let existingSocketId = null;
    for (const [id, user] of Object.entries(rooms[room])) {
        if (user.deviceId === deviceId) {
            existingSocketId = id;
            break;
        }
    }

    if (existingSocketId) {
        const existingUser = rooms[room][existingSocketId];
        delete rooms[room][existingSocketId];

        rooms[room][socket.id] = {
            id: userId,
            name,
            isAdmin,
            deviceId,
            selectedScore: existingUser.selectedScore ?? null,
            isOnline: true,

        };

        // 🔸 Önceki seçimi varsa client’a geri gönder
        if (existingUser?.selectedScore) {
            socket.emit(EVENT_SCORE_UPDATE, {
                user: {
                    id: userId,
                    name,
                    isAdmin,
                    deviceId,
                    selectedScore: existingUser.selectedScore,
                    isOnline: true,

                },
            });
        }
    } else {
        // 🔹 Yeni kullanıcı ekle
        rooms[room][socket.id] = {
            id: userId,
            name,
            isAdmin,
            deviceId,
            selectedScore: null,
            isOnline: true,
        };
    }
    // 🔸 Odaya yeni kullanıcı listesi yayınla
    io.to(room).emit(EVENT_ROOM_USERS, Object.values(rooms[room]));

    // 🔸 Yeni bağlanan kullanıcıyı güncelle
    io.to(room).emit(EVENT_SCORE_UPDATE, {
        user: rooms[room][socket.id],
    });
}

function handleSendScore(socket, { scoreId, score, userId }) {
  const { room, name, isAdmin, deviceId } = socket.data;

  if (!room || !rooms[room] || !deviceId) return;

  const userEntry = Object.entries(rooms[room]).find(
    ([_, user]) => user.deviceId === deviceId
  );

  if (!userEntry) return;

  const [key, user] = userEntry;

  user.selectedScore = {
      score,
      scoreId,
  }

  const scoresData = getScoreCounts(rooms[room]);

  // Ortalama puanı hesapla
  const totalVotes = scoresData.reduce((sum, item) => sum + item.count, 0);
  const average =
  scoresData.reduce((sum, item) => sum + item.score * item.count, 0) / totalVotes;

  // winnerScore'u hesapla
  const winnerScore = findClosestFibonacci(average);

  // Grafik verisi oluştur
  const pieChartData = convertToPieChartData(scoresData);


  io.to(room).emit(EVENT_SCORE_UPDATE, {
    user: {
        id: userId,
        name,
        deviceId,
        isAdmin,
        selectedScore: {
            score,
            scoreId
        }
    },
    calculateScore: { chart: pieChartData, winnerScore },
  });
}

function handleDisconnect(socket) {
    const { room, userId } = socket.data || {};
    if (!room || !rooms[room]) return;

    const userEntry = Object.entries(rooms[room]).find(
        ([_, user]) => user.id === userId
    );

    if (!userEntry) return;
    const [socketId, user] = userEntry;

    user.isOnline = false;
    rooms[room][socketId] = user;

    io.to(room).emit(EVENT_ROOM_USERS, Object.values(rooms[room]));
}

function convertToPieChartData(scoresData) {
  const totalVotes = scoresData.reduce((sum, item) => sum + item.count, 0);
  return scoresData.map((item, index) => ({
    id: index,
    value: (item.count / totalVotes) * 100,
    label: item.score.toString(),
    count: item.count,
  }));
}

function getScoreCounts(roomData) {
  const counts = {};

  for (const userId in roomData) {
    const user = roomData[userId];
    if (!user) continue;

    const score = user?.selectedScore?.score;
    if (score !== undefined && score !== null && score !== 0) {
      counts[score] = (counts[score] || 0) + 1;
    }
  }

  return Object.entries(counts).map(([score, count]) => ({
    score: parseInt(score),
    count,
  }));
}

function findClosestFibonacci(target) {
  if (target <= 0) return 0;

  let a = 0,
    b = 1;
  while (b < target) {
    const next = a + b;
    a = b;
    b = next;
  }

  const distA = Math.abs(target - a);
  const distB = Math.abs(b - target);

  if (distA < distB) {
    return a;
  } else if (distB < distA) {
    return b;
  } else {
    // Eşit uzaklık durumunda büyük olanı döndür
    return b;
  }
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});
