"use strict";

const $ = (id) => document.getElementById(id);
const bank = WORD_BANK.map(([id, word, clue, ...variants]) => ({
  id, word, clue, variants, unit: Number(id.split("-")[0]),
}));
const units = Array.from({ length: 8 }, (_, index) => bank.filter((entry) => entry.unit === index + 1));
const keys = {
  mistakes: "jiang-dictation.mistakes.v1",
  hint: "jiang-dictation.hint.v1",
  unit: "jiang-dictation.unit.v1",
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    $("save-note").textContent = "浏览器未能保存记录，刷新后可能丢失";
  }
}

function readMistakes() {
  const saved = read(keys.mistakes, {});
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {};
  return saved;
}

function normalize(answer) {
  return answer.normalize("NFKC").toLowerCase().trim()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/\s*([/\-])\s*/g, "$1")
    .replace(/\s+/g, " ")
    .replace(/\./g, "");
}

function makeSession(words) {
  return { words, index: 0, correct: 0, outcome: null };
}

const unitSessions = units.map(makeSession);
let selectedUnit = read(keys.unit, 1);
if (!Number.isInteger(selectedUnit) || !units[selectedUnit - 1]) selectedUnit = 1;
let mistakes = readMistakes();
let reviewSession = null;
let page = "practice";

function activeSession() {
  return page === "review" ? reviewSession : unitSessions[selectedUnit - 1];
}

function mistakeCount(entry) {
  const count = mistakes[entry.id];
  return Number.isSafeInteger(count) && count > 0 ? count : 0;
}

function recordedWords() {
  return bank.filter((entry) => mistakeCount(entry) > 0)
    .sort((a, b) => mistakeCount(b) - mistakeCount(a));
}

function filteredMistakes() {
  const unit = $("mistake-unit").value;
  return recordedWords().filter((entry) => unit === "all" || entry.unit === Number(unit));
}

function updateBadge() {
  const count = recordedWords().length;
  $("nav-count").textContent = count;
  $("nav-count").hidden = count === 0;
}

function showHint() {
  const session = activeSession();
  const entry = session?.words[session.index];
  $("initial").hidden = !entry || !$("hint-toggle").checked;
  $("initial").textContent = entry ? "首字母  " + entry.word[0] : "";
}

function showQuestion() {
  const session = activeSession();
  const inReview = page === "review";
  const total = session.words.length;
  const finished = session.index === total;
  const entry = session.words[session.index];
  const unitName = "Unit " + String(selectedUnit).padStart(2, "0");

  $("exercise-title").textContent = inReview ? "错题复习" : unitName;
  $("exercise-subtitle").textContent = inReview ? "重新默写曾经答错的词条" : "单元练习";
  $("progress-current").textContent = Math.min(session.index + 1, total);
  $("progress-total").textContent = " / " + total;
  $("progress").max = total;
  $("progress").value = session.index + Number(Boolean(session.outcome));
  $("exit-review").hidden = !inReview;
  $("answer-form").hidden = finished;
  $("result").hidden = !finished;
  $("result-title").textContent = inReview ? "本轮复习已完成" : unitName + " 已完成";
  $("result-summary").textContent = `共 ${total} 题 · 答对 ${session.correct} 题 · 错题 ${total - session.correct} 题`;
  if (finished) return;

  const outcome = session.outcome;
  const answer = $("answer");
  $("clue").textContent = entry.clue;
  answer.value = outcome?.answer ?? "";
  answer.readOnly = Boolean(outcome);
  if (outcome && !outcome.correct && outcome.answer) answer.setAttribute("aria-invalid", "true");
  else answer.removeAttribute("aria-invalid");
  const feedback = $("feedback");
  feedback.classList.toggle("correct", Boolean(outcome?.correct));
  feedback.textContent = "";
  if (outcome) {
    const label = outcome.correct ? "答对了" : (outcome.answer ? "拼写有误 · 正确答案" : "已记入错题本 · 正确答案");
    const word = document.createElement("strong");
    word.lang = "en";
    word.textContent = outcome.correct ? outcome.answer : entry.word;
    feedback.append(label + "  ", word);
  }
  $("submit").querySelector("span").textContent = outcome ? (session.index + 1 === total ? "查看结果" : "下一题") : "提交答案";
  $("skip").hidden = Boolean(outcome);
  showHint();
}

function recordAnswer(answer) {
  const session = activeSession();
  if (session.outcome) return;
  const entry = session.words[session.index];
  const correct = [entry.word, ...entry.variants].some((word) => normalize(word) === normalize(answer));
  session.outcome = { answer, correct };
  if (correct) {
    session.correct += 1;
  } else {
    mistakes = { ...readMistakes(), ...mistakes };
    mistakes[entry.id] = mistakeCount(entry) + 1;
    write(keys.mistakes, mistakes);
    updateBadge();
  }
  showQuestion();
  $("submit").focus();
}

function showMistakes() {
  const words = recordedWords();
  const visible = filteredMistakes();
  const totalErrors = words.reduce((sum, entry) => sum + mistakeCount(entry), 0);
  $("mistake-summary").textContent = `${words.length} 个词条 · 累计答错 ${totalErrors} 次`;
  $("mistake-empty").hidden = words.length > 0;
  $("mistake-content").hidden = words.length === 0;
  $("review-all").hidden = words.length === 0;
  $("review-all").disabled = visible.length === 0;
  $("filter-empty").hidden = visible.length > 0;
  $("mistake-list").replaceChildren(...visible.map((entry) => {
    const row = document.createElement("li");
    row.className = "mistake-row";
    const details = document.createElement("div");
    const word = document.createElement("strong");
    word.className = "mistake-word";
    word.lang = "en";
    word.textContent = entry.word;
    const clue = document.createElement("small");
    clue.className = "mistake-clue";
    clue.textContent = `Unit ${String(entry.unit).padStart(2, "0")} · ${entry.clue}`;
    details.append(word, clue);
    const count = document.createElement("span");
    count.className = "mistake-count";
    count.textContent = `错 ${mistakeCount(entry)} 次`;
    const button = document.createElement("button");
    button.className = "quiet";
    button.type = "button";
    button.textContent = "复习";
    button.setAttribute("aria-label", "复习 " + entry.word);
    button.addEventListener("click", () => beginReview([entry]));
    row.append(details, count, button);
    return row;
  }));
}

function renderPage(focusAnswer = false) {
  const route = location.hash.slice(1);
  page = route === "review" && !reviewSession ? "mistakes" : route;
  if (page !== "mistakes" && page !== "review") page = "practice";
  const inPractice = page === "practice";
  const inMistakes = page === "mistakes";
  $("practice-view").hidden = inMistakes;
  $("mistakes-view").hidden = !inMistakes;
  $("nav-practice").toggleAttribute("aria-current", inPractice);
  $("nav-mistakes").toggleAttribute("aria-current", !inPractice);
  (inPractice ? $("nav-practice") : $("nav-mistakes")).setAttribute("aria-current", "page");
  $("page-title").textContent = inPractice ? "单词默写" : "错题本";
  $("page-description").textContent = inPractice
    ? "选择一个单元，根据中文释义写出对应的英文单词或短语。"
    : "回顾错过的词条，按累计错误次数复习。";
  document.querySelectorAll(".unit").forEach((button) => {
    button.setAttribute("aria-pressed", String(inPractice && Number(button.dataset.unit) === selectedUnit));
  });

  updateBadge();
  if (inMistakes) {
    showMistakes();
  } else {
    showQuestion();
    if (focusAnswer) focusQuestion();
  }
}

function focusQuestion() {
  const session = activeSession();
  if (session.index === session.words.length) $("restart").focus();
  else if (session.outcome) $("submit").focus();
  else $("answer").focus();
}

let focusOnRouteChange = false;
function goTo(route) {
  if (location.hash === "#" + route) {
    renderPage(true);
    return;
  }
  focusOnRouteChange = true;
  location.hash = route;
}

function beginReview(words) {
  if (!words.length) return;
  reviewSession = makeSession(words);
  goTo("review");
}

$("bank-size").textContent = `${units.length} 个单元 · ${bank.length} 个词条`;
$("hint-toggle").checked = read(keys.hint, false) === true;

units.forEach((words, index) => {
  const unit = index + 1;
  const name = "Unit " + String(unit).padStart(2, "0");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "unit";
  button.dataset.unit = unit;
  button.innerHTML = `<strong>${name}</strong><small>${words.length} 个词条</small><svg class="icon" aria-hidden="true"><use href="#check"/></svg>`;
  button.addEventListener("click", () => {
    selectedUnit = unit;
    write(keys.unit, unit);
    goTo("practice");
  });
  $("units").append(button);
  $("mistake-unit").add(new Option(name, String(unit)));
});

$("hint-toggle").addEventListener("change", (event) => {
  write(keys.hint, event.target.checked);
  showHint();
});

$("answer-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const session = activeSession();
  if (session.outcome) {
    session.index += 1;
    session.outcome = null;
    showQuestion();
    focusQuestion();
    return;
  }
  const answer = $("answer").value.trim();
  if (!normalize(answer)) {
    $("feedback").textContent = "请输入英文单词或短语。";
    $("answer").focus();
    return;
  }
  recordAnswer(answer);
});

$("skip").addEventListener("click", () => recordAnswer(""));
$("restart").addEventListener("click", () => {
  if (page === "review") reviewSession = makeSession(reviewSession.words);
  else unitSessions[selectedUnit - 1] = makeSession(units[selectedUnit - 1]);
  showQuestion();
  focusQuestion();
});
$("review-all").addEventListener("click", () => beginReview(filteredMistakes()));
$("mistake-unit").addEventListener("change", showMistakes);
window.addEventListener("hashchange", () => {
  renderPage(focusOnRouteChange);
  focusOnRouteChange = false;
});
window.addEventListener("storage", (event) => {
  if (event.key !== keys.mistakes && event.key !== null) return;
  mistakes = readMistakes();
  updateBadge();
  if (page === "mistakes") showMistakes();
});
renderPage();
