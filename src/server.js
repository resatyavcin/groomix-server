const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const rooms = {};

io.on("connection", (socket) => {
  socket.on("join-room", ({ room, name, isAdmin, deviceId }) => {
    socket.join(room);
    socket.data = { room, name, isAdmin, deviceId };

    if (!rooms[room]) {
      rooms[room] = {};
    }

    let previousScore = null;
    let previousScoreId = null;

    for (const [id, user] of Object.entries(rooms[room])) {
      // Aynı deviceId varsa önceki kaydı sil
      if (deviceId && user.deviceId === deviceId) {
        previousScore = user.score || null;
        previousScoreId = user.scoreId || null;

        delete rooms[room][id];
      }

      // Kullanıcının deviceId'si yoksa (geçersiz/zombi kullanıcı)
      if (!user.deviceId) {
        delete rooms[room][id];
      }
    }

    rooms[room][socket.id] = { name, deviceId, isAdmin };
    if (previousScore !== null) {
      rooms[room][socket.id].score = previousScore;
      rooms[room][socket.id].scoreId = previousScoreId;

      socket.emit("score-update", {
        username: name,
        score: previousScore,
        scoreId: previousScoreId,
      });
    }

    io.to(room).emit("room-users", Object.values(rooms[room]));
  });

  socket.on("send-score", ({ scoreId, score }) => {
    const { room, name, deviceId } = socket.data;

    if (!room || !rooms[room] || !deviceId) return;

    const userEntry = Object.entries(rooms[room]).find(
      ([_, user]) => user.deviceId === deviceId
    );

    if (userEntry) {
      const [key, user] = userEntry;
      user.scoreId = scoreId;
      user.score = score;

      io.to(room).emit("score-update", {
        username: name,
        score,
        scoreId,
      });
    }
  });
});

server.listen(3001, () => {
  console.log("✅ Socket server çalışıyor: 3001");
});
