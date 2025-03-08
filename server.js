const mongoose = require('mongoose');
const Game = require('./models/Game');
const Predictor = require('./models/Predictor');
const Prediction = require('./models/Prediction');

// الاتصال بقاعدة البيانات
mongoose.connect('mongodb://localhost:27017/prediction-game', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// إنشاء جلسة لعبة جديدة
app.post('/api/games', async (req, res) => {
  const { question } = req.body;
  const game = new Game({ question });
  await game.save();
  res.json({ gameId: game._id });
});

// الانضمام إلى جلسة لعبة
app.post('/api/games/:gameId/join', async (req, res) => {
  const { gameId } = req.params;
  const { username } = req.body;

  const game = await Game.findById(gameId);
  if (!game) {
    return res.status(404).json({ error: 'الجلسة غير موجودة' });
  }

  // التحقق من أن الجلسة ليست ممتلئة
  const predictorsCount = await Predictor.countDocuments({ gameId });
  if (predictorsCount >= game.maxPredictors) {
    return res.status(400).json({ error: 'الجلسة ممتلئة' });
  }

  // إضافة اللاعب إلى الجلسة
  const predictor = new Predictor({ gameId, username, avatarColor: getAvatarColor(predictorsCount) });
  await predictor.save();

  // إذا كان هذا أول لاعب، نضبط وقت انتهاء الجلسة (3 أيام من الآن)
  if (predictorsCount === 0) {
    game.expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 أيام
    await game.save();
  }

  res.json({ predictorId: predictor._id, game });
});

// إرسال تنبؤ
app.post('/api/games/:gameId/predict', async (req, res) => {
  const { gameId } = req.params;
  const { predictorId, prediction } = req.body;

  const game = await Game.findById(gameId);
  if (!game) {
    return res.status(404).json({ error: 'الجلسة غير موجودة' });
  }

  // التحقق من أن اللاعب موجود في الجلسة
  const predictor = await Predictor.findById(predictorId);
  if (!predictor || predictor.gameId.toString() !== gameId) {
    return res.status(403).json({ error: 'لاعب غير مسجل في هذه الجلسة' });
  }

  // التحقق من أن اللاعب لم يرسل تنبؤًا مسبقًا
  const existingPrediction = await Prediction.findOne({ predictorId });
  if (existingPrediction) {
    return res.status(400).json({ error: 'لقد أرسلت تنبؤًا مسبقًا' });
  }

  // إضافة التنبؤ
  const newPrediction = new Prediction({ gameId, predictorId, content: prediction });
  await newPrediction.save();

  // إضافة التنبؤ إلى الجلسة
  game.predictions.push(newPrediction._id);
  await game.save();

  // التحقق من اكتمال جميع التنبؤات
  const predictionsCount = await Prediction.countDocuments({ gameId });
  if (predictionsCount === game.maxPredictors) {
    game.status = 'completed';
    await game.save();
  }

  res.json({ success: true });
});