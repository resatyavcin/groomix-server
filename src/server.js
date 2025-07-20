const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const EVENT_JOIN_ROOM = "join-room";
const EVENT_ROOM_USERS = "room-users";
const EVENT_SEND_SCORE = "send-score";
const EVENT_SCORE_UPDATE = "score-update";
const EVENT_RESET_SCORES = "reset-scores";
const EVENT_SHOW_ALL_SCORES = "show-all-scores";

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const rooms = {};

io.on("connection", (socket) => {
  socket.on(EVENT_JOIN_ROOM, (payload) => handleJoinRoom(socket, payload));
  socket.on(EVENT_SEND_SCORE, (payload) => handleSendScore(socket, payload));
  socket.on(EVENT_RESET_SCORES, () => handleResetScores(socket));
  socket.on(EVENT_SHOW_ALL_SCORES, (payload) =>
    handleShowAllScores(socket, payload)
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
    user.score = undefined;
    user.scoreId = undefined;
  }

  io.to(room).emit("show-all-scores", false);
  io.to(room).emit("room-users", Object.values(rooms[room]));
}

function handleJoinRoom(socket, { room, name, isAdmin, deviceId }) {
  socket.join(room);
  socket.data = { room, name, isAdmin, deviceId };

  if (!rooms[room]) {
    rooms[room] = {};
  }

  let previousScore = null;
  let previousScoreId = null;

  for (const [id, user] of Object.entries(rooms[room])) {
    const isSameDevice = deviceId && user.deviceId === deviceId;
    const isInvalidUser = !user.deviceId;

    if (isSameDevice) {
      previousScore = user.score || null;
      previousScoreId = user.scoreId || null;
      delete rooms[room][id];
    }

    if (isInvalidUser) {
      delete rooms[room][id];
    }
  }

  rooms[room][socket.id] = { name, deviceId, isAdmin };

  if (previousScore !== null) {
    rooms[room][socket.id].score = previousScore;
    rooms[room][socket.id].scoreId = previousScoreId;

    socket.emit(EVENT_SCORE_UPDATE, {
      username: name,
      score: previousScore,
      scoreId: previousScoreId,
      calculateScore: convertToPieChartData(
        calculateMostFrequentScores(rooms[room])
      ),
    });
  }

  io.to(room).emit(EVENT_ROOM_USERS, Object.values(rooms[room]));
}

function handleSendScore(socket, { scoreId, score }) {
  const { room, name, deviceId } = socket.data;

  if (!room || !rooms[room] || !deviceId) return;

  const userEntry = Object.entries(rooms[room]).find(
    ([_, user]) => user.deviceId === deviceId
  );

  if (!userEntry) return;

  const [key, user] = userEntry;

  user.scoreId = scoreId;
  user.score = score;

  console.log(convertToPieChartData(calculateMostFrequentScores(rooms[room])));

  io.to(room).emit(EVENT_SCORE_UPDATE, {
    username: name,
    score,
    scoreId,
    calculateScore: convertToPieChartData(
      calculateMostFrequentScores(rooms[room])
    ),
  });
}

function convertToPieChartData(scoresData) {
  const totalVotes = scoresData.reduce((sum, item) => sum + item.count, 0);

  const filteredScores = scoresData.filter((item) => item.score !== 0);

  return filteredScores.map((item, index) => ({
    id: index,
    value: (item.count / totalVotes) * 100,
    label: item.score.toString(),
    count: item.count,
  }));
}

function calculateMostFrequentScores(roomData) {
  const scoreCount = {};

  for (const userId in roomData) {
    const user = roomData[userId];

    if (user.score !== undefined && user.score !== null) {
      const scoreKey = `${user.scoreId}:${user.score}`;

      if (scoreCount[scoreKey]) {
        scoreCount[scoreKey] += 1;
      } else {
        scoreCount[scoreKey] = 1;
      }
    }
  }

  let result = [];
  let maxCount = 0;

  for (const scoreKey in scoreCount) {
    const [scoreId, score] = scoreKey.split(":");

    const parsedScoreId = parseInt(scoreId);
    const parsedScore = parseInt(score);

    if (isNaN(parsedScoreId) || isNaN(parsedScore)) {
      continue;
    }

    // Skorları ve en yüksek skoru güncelliyoruz
    if (scoreCount[scoreKey] > maxCount) {
      maxCount = scoreCount[scoreKey];
      result = [
        {
          scoreId: parsedScoreId,
          score: parsedScore,
          count: maxCount,
          winScore: true,
        },
      ];
    } else if (scoreCount[scoreKey] === maxCount) {
      result.push({
        scoreId: parsedScoreId,
        score: parsedScore,
        count: maxCount,
        winScore: true,
      });
    } else {
      result.push({
        scoreId: parsedScoreId,
        score: parsedScore,
        count: scoreCount[scoreKey],
        winScore: false,
      });
    }
  }

  return result;
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
