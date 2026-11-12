"use strict";

const $ = (id) => document.getElementById(id);
const bank = WORD_BANK.map(([id, word, clue, ...variants]) => ({
  id, word, clue, variants, unit: Number(id.split("-")[0]),
}));
const units = Array.from({ length: 8 }, (_, index) => bank.filter((entry) => entry.unit === index + 1));
const keys = {
  mistakes: "jiang-dictation.mistakes.v1",
  hint: "jiang-dictation.hint.v1",
  legacyUnit: "jiang-dictation.unit.v1",
  settings: "jiang-dictation.settings.v2",
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

function readMistakes(fallback = {}) {
  const saved = read(keys.mistakes, fallback);
  return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : fallback;
}

function normalize(answer) {
  return answer.normalize("NFKC").toLowerCase().trim()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/\s*([/\-])\s*/g, "$1")
    .replace(/\s+/g, " ")
    .replace(/\./g, "");
}

function shuffled(values) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}

function makeSession(source, mode, shuffle, title) {
  return {
    source,
    mode,
    shuffle,
    title,
    words: shuffle ? shuffled(source) : source,
    index: 0,
    correct: 0,
    outcome: null,
    options: null,
    selection: "",
  };
}

function unitName(unit) {
  return "Unit " + String(unit).padStart(2, "0");
}

function wordsFor(unitNumbers) {
  return unitNumbers.flatMap((unit) => units[unit - 1]);
}

function practiceFrom(settings) {
  const title = settings.units.length === 1 ? unitName(settings.units[0]) : "多单元练习";
  return makeSession(wordsFor(settings.units), settings.mode, settings.shuffle, title);
}

const saved = read(keys.settings, null);
const previousUnits = Array.isArray(saved?.units) ? saved.units : [read(keys.legacyUnit, 1)];
const validUnits = [...new Set(previousUnits.filter((unit) => Number.isInteger(unit) && units[unit - 1]))]
  .sort((a, b) => a - b);
const selected = new Set(validUnits.length ? validUnits : [1]);
let practiceSession = practiceFrom({
  units: [...selected],
  mode: saved?.mode === "meaning" ? "meaning" : "dictation",
  shuffle: saved?.shuffle === true,
});
let mistakes = readMistakes();
let reviewSession = null;
let page = "practice";

function activeSession() {
  return page === "review" ? reviewSession : practiceSession;
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

function updateSettings() {
  document.querySelectorAll(".unit").forEach((button) => {
    button.setAttribute("aria-pressed", String(selected.has(Number(button.dataset.unit))));
  });
  const count = wordsFor([...selected]).length;
  $("start-practice").disabled = count === 0;
  $("selection-summary").textContent = count ? `已选 ${selected.size} 个单元 · ${count} 题` : "请至少选择一个单元";
  $("hint-control").hidden = activeSession().mode === "meaning";
}

function showHint() {
  const session = activeSession();
  const entry = session.words[session.index];
  $("initial").hidden = !entry || session.mode !== "dictation" || !$("hint-toggle").checked;
  $("initial").textContent = entry ? "首字母  " + entry.word[0] : "";
}

function choiceOptions(entry) {
  const otherMeanings = new Set();
  for (const option of shuffled(units[entry.unit - 1])) {
    if (normalize(option.word) !== normalize(entry.word) && option.clue !== entry.clue) {
      otherMeanings.add(option.clue);
      if (otherMeanings.size === 3) break;
    }
  }
  return shuffled([entry.clue, ...otherMeanings]);
}

function showChoices(session, entry) {
  session.options ??= choiceOptions(entry);
  $("choices").replaceChildren(...session.options.map((meaning, index) => {
    const label = document.createElement("label");
    label.className = "choice";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "meaning";
    input.value = meaning;
    input.checked = session.selection === meaning;
    input.disabled = Boolean(session.outcome);
    input.addEventListener("change", () => {
      session.selection = meaning;
      $("feedback").textContent = "";
    });
    const body = document.createElement("span");
    body.className = "choice-body";
    const letter = document.createElement("span");
    letter.className = "choice-letter";
    letter.setAttribute("aria-hidden", "true");
    letter.textContent = "ABCD"[index];
    body.append(letter, document.createTextNode(meaning));
    label.append(input, body);
    if (session.outcome && meaning === entry.clue) label.classList.add("correct");
    if (session.outcome && meaning === session.selection && !session.outcome.correct) label.classList.add("incorrect");
    return label;
  }));
}

function showQuestion() {
  const session = activeSession();
  const inReview = page === "review";
  const meaningMode = session.mode === "meaning";
  const total = session.words.length;
  const finished = session.index === total;
  const entry = session.words[session.index];
  const modeName = meaningMode ? "看英文选词义" : "看中文写英文";

  $("exercise-title").textContent = session.title;
  $("exercise-subtitle").textContent = `${modeName} · ${entry ? unitName(entry.unit) : `${total} 题`}${session.shuffle ? " · 乱序" : ""}`;
  $("progress-current").textContent = Math.min(session.index + 1, total);
  $("progress-total").textContent = " / " + total;
  $("progress").max = total;
  $("progress").value = session.index + Number(Boolean(session.outcome));
  $("exit-review").hidden = !inReview;
  $("answer-form").hidden = finished;
  $("result").hidden = !finished;
  $("result-title").textContent = session.title + " 已完成";
  $("result-summary").textContent = `共 ${total} 题 · 答对 ${session.correct} 题 · 错题 ${total - session.correct} 题`;
  $("exercise-tip").textContent = meaningMode ? "选择词义后提交答案" : "按 Enter 提交或进入下一题";
  if (finished) return;

  const outcome = session.outcome;
  const answer = $("answer");
  $("question-label").textContent = meaningMode ? "英文单词或短语" : "中文释义";
  $("clue").lang = meaningMode ? "en" : "zh-CN";
  $("clue").textContent = meaningMode ? entry.word : entry.clue;
  $("dictation-answer").hidden = meaningMode;
  $("meaning-answer").hidden = !meaningMode;
  if (meaningMode) {
    showChoices(session, entry);
  } else {
    answer.value = outcome?.answer ?? "";
    answer.readOnly = Boolean(outcome);
    if (outcome && !outcome.correct && outcome.answer) answer.setAttribute("aria-invalid", "true");
    else answer.removeAttribute("aria-invalid");
  }

  const feedback = $("feedback");
  feedback.classList.toggle("correct", Boolean(outcome?.correct));
  feedback.textContent = "";
  if (outcome) {
    let label = "答对了";
    if (!outcome.correct) label = outcome.answer ? "答错了 · 正确答案" : "已记入错题本 · 正确答案";
    const solution = document.createElement("strong");
    solution.lang = meaningMode ? "zh-CN" : "en";
    solution.textContent = outcome.correct ? outcome.answer : meaningMode ? entry.clue : entry.word;
    feedback.append(label + "  ", solution);
  }
  $("submit").querySelector("span").textContent = outcome ? (session.index + 1 === total ? "查看结果" : "下一题") : "提交答案";
  $("skip").hidden = Boolean(outcome);
  showHint();
}

function recordAnswer(answer) {
  const session = activeSession();
  if (session.outcome) return;
  const entry = session.words[session.index];
  const correct = session.mode === "meaning"
    ? answer === entry.clue
    : [entry.word, ...entry.variants].some((word) => normalize(word) === normalize(answer));
  session.outcome = { answer, correct };
  if (correct) {
    session.correct += 1;
  } else {
    mistakes = readMistakes(mistakes);
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
    clue.textContent = `${unitName(entry.unit)} · ${entry.clue}`;
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
  $("page-title").textContent = inPractice ? "单词练习" : "错题本";
  $("page-description").textContent = inPractice
    ? "选择一个或多个单元，再选择练习方式。"
    : "回顾错过的词条，按累计错误次数复习。";

  updateBadge();
  if (inMistakes) {
    showMistakes();
  } else {
    updateSettings();
    showQuestion();
    if (focusAnswer) focusQuestion();
  }
}

function focusQuestion() {
  const session = activeSession();
  if (session.index === session.words.length) $("restart").focus();
  else if (session.outcome) $("submit").focus();
  else if (session.mode === "meaning") ($("choices").querySelector("input:checked") ?? $("choices").querySelector("input")).focus();
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
  reviewSession = makeSession(words, practiceSession.mode, practiceSession.shuffle, "错题复习");
  goTo("review");
}

$("bank-size").textContent = `${units.length} 个单元 · ${bank.length} 个词条`;
$("hint-toggle").checked = read(keys.hint, false) === true;
$("shuffle-toggle").checked = practiceSession.shuffle;
document.querySelector(`input[name="mode"][value="${practiceSession.mode}"]`).checked = true;

units.forEach((words, index) => {
  const unit = index + 1;
  const name = unitName(unit);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "unit";
  button.dataset.unit = unit;
  button.innerHTML = `<strong>${name}</strong><small>${words.length} 个词条</small><svg class="icon" aria-hidden="true"><use href="#check"/></svg>`;
  button.addEventListener("click", () => {
    if (!selected.delete(unit)) selected.add(unit);
    updateSettings();
  });
  $("units").append(button);
  $("mistake-unit").add(new Option(name, String(unit)));
});

document.querySelectorAll('input[name="mode"]').forEach((radio) => {
  radio.addEventListener("change", updateSettings);
});
$("start-practice").addEventListener("click", () => {
  if (selected.size === 0) return;
  const settings = {
    units: [...selected].sort((a, b) => a - b),
    mode: document.querySelector('input[name="mode"]:checked').value,
    shuffle: $("shuffle-toggle").checked,
  };
  practiceSession = practiceFrom(settings);
  write(keys.settings, settings);
  goTo("practice");
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
    session.options = null;
    session.selection = "";
    showQuestion();
    focusQuestion();
    return;
  }
  const meaningMode = session.mode === "meaning";
  const answer = meaningMode ? session.selection : $("answer").value.trim();
  if (!normalize(answer)) {
    $("feedback").textContent = meaningMode ? "请先选择一个中文词义。" : "请输入英文单词或短语。";
    focusQuestion();
    return;
  }
  recordAnswer(answer);
});

$("skip").addEventListener("click", () => recordAnswer(""));
$("restart").addEventListener("click", () => {
  const session = activeSession();
  const restarted = makeSession(session.source, session.mode, session.shuffle, session.title);
  if (page === "review") reviewSession = restarted;
  else practiceSession = restarted;
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

