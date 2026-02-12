/**
 * 🇪🇸 Spanish Vocab App - Core Logic
 */

// --- 1. 数据服务 (Data Service) ---
class DataService {
    constructor() {
        this.data = null;
        this.flatWords = [];
    }

    async load() {
        try {
            const response = await fetch('data/vocab.json');
            this.data = await response.json();
            this.flatWords = [];
            this.data.forEach(unit => {
                unit.topics.forEach(topic => {
                    topic.words.forEach(word => {
                        this.flatWords.push({ ...word, unitId: unit.id, topicId: topic.id });
                    });
                });
            });
        } catch (e) {
            console.error(e);
            document.getElementById('loading').innerHTML = '<p style="color:red">加载失败，请刷新重试</p>';
        }
    }

    getUnits() { return this.data; }
    
    getTopics(unitId) {
        const unit = this.data.find(u => u.id === unitId);
        return unit ? unit.topics : [];
    }

    getWords(unitId, topicId) {
        let words = [];
        const unit = this.data.find(u => u.id === unitId);
        if (!unit) return [];

        if (topicId === 'all') {
            unit.topics.forEach(t => words = words.concat(t.words));
        } else {
            const topic = unit.topics.find(t => t.id === topicId);
            if (topic) words = topic.words;
        }
        return words;
    }

    getRandomDistractors(correctWord, count = 3, type = 'zh') {
        const pool = this.flatWords.filter(w => w.id !== correctWord.id);
        const distractors = [];
        while (distractors.length < count && pool.length > 0) {
            const idx = Math.floor(Math.random() * pool.length);
            distractors.push(pool[idx]);
            pool.splice(idx, 1);
        }
        return distractors.map(w => type === 'zh' ? w.zh : w.es);
    }
}

// --- 2. 存储服务 (Storage Service) ---
class StorageService {
    constructor() {
        this.KEY = 'sp_vocab_progress_v2';
        this.state = JSON.parse(localStorage.getItem(this.KEY)) || {};
    }

    save() {
        localStorage.setItem(this.KEY, JSON.stringify(this.state));
    }

    // 获取状态: 'green', 'yellow', 'red' 或 null (未标记)
    getStatus(wordId) {
        return (this.state[wordId] && this.state[wordId].status) || null;
    }

    setStatus(wordId, status) {
        if (!this.state[wordId]) this.state[wordId] = {};
        this.state[wordId].status = status;
        this.save();
    }

    resetScope(wordIds) {
        wordIds.forEach(id => {
            if (this.state[id]) delete this.state[id];
        });
        this.save();
    }
}

// --- 3. 语音服务 (Audio Service) ---
class AudioService {
    constructor() {
        this.synth = window.speechSynthesis;
    }

    speak(text) {
        if (this.synth.speaking) {
            this.synth.cancel();
        }
        const utterThis = new SpeechSynthesisUtterance(text);
        utterThis.lang = 'es-ES';
        utterThis.rate = 0.9; 
        this.synth.speak(utterThis);
    }
}

const dataService = new DataService();
const storageService = new StorageService();
const audioService = new AudioService();

const appContainer = document.getElementById('app-container');
const homeBtn = document.getElementById('home-btn');

let currentMode = '';
let currentWords = [];
let quizQueue = [];
let quizStats = { total: 0, errors: {} };

(async () => {
    await dataService.load();
    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    homeBtn.addEventListener('click', () => window.location.hash = '');
})();

function handleHashChange() {
    const hash = window.location.hash || '#home';
    homeBtn.classList.toggle('hidden', hash === '#home');
    
    if (hash === '#home') renderHome();
    else if (hash === '#study-select') renderSelection('study');
    else if (hash === '#test-select') renderSelection('test');
    else if (hash === '#dictation-select') renderSelection('dictation');
    else if (hash === '#study-card') renderStudyCards();
    else if (hash === '#quiz') renderQuiz();
    else if (hash === '#result') renderResult();
}

function renderHome() {
    appContainer.innerHTML = `
        <div class="mode-grid">
            <div class="card mode-card" onclick="location.hash='#study-select'">
                <h2>📖 学习模式</h2>
                <p>标记熟练度，针对性练习</p>
            </div>
            <div class="card mode-card" onclick="location.hash='#test-select'">
                <h2>📝 测试模式</h2>
                <p>严格考核，全面检测</p>
            </div>
            <div class="card mode-card" onclick="location.hash='#dictation-select'">
                <h2>🎧 听写模式</h2>
                <p>专注听音，精准拼写</p>
            </div>
        </div>
    `;
}

function renderSelection(mode) {
    currentMode = mode;
    const units = dataService.getUnits();
    
    appContainer.innerHTML = `
        <div class="card">
            <h2>选择范围 - ${mode === 'study' ? '学习' : (mode === 'test' ? '测试' : '听写')}</h2>
            <div style="margin-top:1.5rem">
                <label>选择单元</label>
                <select id="unit-select">
                    <option value="">-- 请选择 --</option>
                    ${units.map(u => `<option value="${u.id}">${u.title}</option>`).join('')}
                </select>
                
                <label>选择主题</label>
                <select id="topic-select" disabled>
                    <option value="">-- 请先选单元 --</option>
                </select>
            </div>
            <button id="start-btn" class="btn btn-primary" disabled>开始</button>
        </div>
    `;

    const unitSelect = document.getElementById('unit-select');
    const topicSelect = document.getElementById('topic-select');
    const startBtn = document.getElementById('start-btn');

    unitSelect.addEventListener('change', (e) => {
        const unitId = e.target.value;
        topicSelect.innerHTML = '<option value="">-- 请选择 --</option>';
        if (unitId) {
            const topics = dataService.getTopics(unitId);
            topicSelect.innerHTML += `<option value="all">【本单元所有内容】</option>`;
            topicSelect.innerHTML += topics.map(t => `<option value="${t.id}">${t.title}</option>`).join('');
            topicSelect.disabled = false;
        } else {
            topicSelect.disabled = true;
        }
        startBtn.disabled = true;
    });

    topicSelect.addEventListener('change', () => {
        startBtn.disabled = !topicSelect.value;
    });

    startBtn.addEventListener('click', () => {
        currentWords = dataService.getWords(unitSelect.value, topicSelect.value);
        if (currentMode === 'study') {
            window.location.hash = '#study-card';
        } else {
            initQuiz(currentMode);
        }
    });
}

// 渲染学习模式 Part A: 卡片与标记
function renderStudyCards() {
    const render = () => {
        // 计算有多少词是非绿色的（即需要练习的）
        const toPracticeCount = currentWords.filter(w => storageService.getStatus(w.id) !== 'green').length;
        
        appContainer.innerHTML = `
            <div style="display:flex; gap:1rem; margin-bottom:1.5rem; justify-content:space-between; align-items:center; background:white; padding:1rem; border-radius:12px; box-shadow:var(--shadow);">
                <div>
                    <strong>本组待练: ${toPracticeCount} 词</strong>
                </div>
                <div style="display:flex; gap:0.5rem;">
                    <button id="reset-scope-btn" class="btn btn-outline" style="width:auto; font-size:0.9rem; padding:0.5rem 1rem;">重置标记</button>
                    <button id="start-practice-btn" class="btn btn-primary" style="width:auto; font-size:0.9rem; padding:0.5rem 1rem;">开始练习</button>
                </div>
            </div>
            
            <div class="vocab-grid">
                ${currentWords.map(word => {
                    const status = storageService.getStatus(word.id); // null, green, yellow, red
                    return `
                    <div class="vocab-card" id="card-${word.id}">
                        <div class="audio-icon-btn" onclick="window.speak('${word.es}')" title="播放读音">🔊</div>
                        
                        <div class="card-row-1">${word.es}</div>
                        <div class="card-row-2">${word.pos}</div>
                        <div class="card-row-3">${word.zh}</div>
                        
                        <div class="card-actions">
                            <button class="status-toggle-btn btn-green ${status==='green'?'active':''}" onclick="window.mark('${word.id}', 'green')">
                                熟练
                            </button>
                            <button class="status-toggle-btn btn-yellow ${status==='yellow'?'active':''}" onclick="window.mark('${word.id}', 'yellow')">
                                模糊
                            </button>
                            <button class="status-toggle-btn btn-red ${status==='red'?'active':''}" onclick="window.mark('${word.id}', 'red')">
                                陌生
                            </button>
                        </div>
                    </div>
                    `;
                }).join('')}
            </div>
        `;
        
        document.getElementById('start-practice-btn').addEventListener('click', () => initQuiz('study'));
        document.getElementById('reset-scope-btn').addEventListener('click', () => {
            if(confirm('确定清空当前页面的所有熟练度标记？')) {
                storageService.resetScope(currentWords.map(w => w.id));
                render();
            }
        });
    };
    render();
}

window.mark = (id, status) => {
    storageService.setStatus(id, status);
    // 更新 UI
    const card = document.getElementById(`card-${id}`);
    const btns = card.querySelectorAll('.status-toggle-btn');
    btns.forEach(b => b.classList.remove('active'));
    card.querySelector(`.btn-${status}`).classList.add('active');
    
    // 更新顶部计数器逻辑稍微复杂，简单起见重新渲染或忽略动态更新计数
};

window.speak = (text) => {
    audioService.speak(text);
};

// --- Quiz Logic ---

function initQuiz(mode) {
    quizQueue = [];
    quizStats = { total: 0, errors: {} };
    
    let targetWords = [];
    if (mode === 'study') {
        // 学习模式：排除绿色。如果为 null (未标记)，视为需要学习 (非 green)
        targetWords = currentWords.filter(w => storageService.getStatus(w.id) !== 'green');
        if (targetWords.length === 0) {
            alert("太棒了！本范围所有单词已标记为“熟练”。");
            return;
        }
    } else {
        targetWords = [...currentWords];
    }

    targetWords.forEach(word => {
        if (mode === 'study') {
            quizQueue.push({ word, type: 'es_zh', solved: false });
            quizQueue.push({ word, type: 'zh_es', solved: false });
            quizQueue.push({ word, type: 'spell', solved: false });
        } else if (mode === 'test') {
            ['es_zh', 'zh_es', 'spell', 'audio_zh', 'audio_spell'].forEach(type => {
                quizQueue.push({ word, type, solved: false });
            });
        } else if (mode === 'dictation') {
            quizQueue.push({ word, type: 'audio_spell', count: 0 }); 
        }
    });

    quizQueue.sort(() => Math.random() - 0.5);
    quizStats.total = quizQueue.length;
    window.location.hash = '#quiz';
}

function renderQuiz() {
    if (quizQueue.length === 0) {
        window.location.hash = '#result';
        return;
    }

    const task = quizQueue[0];
    const progressPct = ((quizStats.total - quizQueue.length) / quizStats.total) * 100;

    let html = `
        <div class="progress-container"><div class="progress-bar" style="width:${progressPct}%"></div></div>
        <div style="max-width: 600px; margin: 0 auto; text-align: center;">
            <div style="text-align:right; margin-bottom:1rem;">
                <button class="btn btn-outline" style="width:auto; display:inline-block; padding:0.5rem 1rem; font-size:0.9rem" onclick="location.hash='#result'">结束</button>
            </div>
    `;

    const { word, type } = task;

    if (type.startsWith('audio_')) {
        setTimeout(() => audioService.speak(word.es), 300);
    }

    if (type === 'es_zh') html += `<div class="quiz-question">${word.es}</div>`;
    else if (type === 'zh_es' || type === 'spell') html += `<div class="quiz-question">${word.zh}</div>`;
    else if (type.startsWith('audio_')) html += `<button class="btn btn-primary" style="width:auto; display:inline-block; margin-bottom:2rem;" onclick="window.speak('${word.es}')">🔊 点击播放</button>`;

    // Input or Options
    if (type === 'spell' || type === 'audio_spell') {
        html += `
            <div class="input-area">
                <input type="text" id="ans-input" placeholder="输入西语单词" autocomplete="off">
                <button id="submit-ans" class="btn btn-primary">提交</button>
            </div>
            <div id="feedback" class="feedback-msg"></div>
        `;
    } else {
        let options = [];
        let correctText = '';
        if (type === 'es_zh' || type === 'audio_zh') {
            correctText = word.zh;
            options = dataService.getRandomDistractors(word, 3, 'zh');
        } else {
            correctText = word.es;
            options = dataService.getRandomDistractors(word, 3, 'es');
        }
        options.push(correctText);
        options.sort(() => Math.random() - 0.5);

        html += `<div class="quiz-options">`;
        options.forEach(opt => {
            const safeOpt = opt.replace(/'/g, "\\'");
            const safeCorrect = correctText.replace(/'/g, "\\'");
            html += `<button class="option-btn" onclick="window.checkChoice(this, '${safeOpt}', '${safeCorrect}')">${opt}</button>`;
        });
        html += `</div><div id="feedback" class="feedback-msg"></div>`;
    }

    html += `</div>`;
    appContainer.innerHTML = html;

    if (document.getElementById('ans-input')) {
        const input = document.getElementById('ans-input');
        const btn = document.getElementById('submit-ans');
        input.focus();
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') btn.click();
        });
        btn.addEventListener('click', () => {
            window.checkSpell(input.value, word.es);
        });
    }
}

window.checkChoice = (btnEl, choice, correct) => {
    const isCorrect = choice === correct;
    document.querySelectorAll('.option-btn').forEach(b => {
        b.disabled = true;
        if(b.textContent === correct) b.classList.add('correct');
        else if(b === btnEl && !isCorrect) b.classList.add('wrong');
    });
    handleAnswerResult(isCorrect, correct);
};

window.checkSpell = (inputVal, correct) => {
    const isCorrect = inputVal.trim().toLowerCase() === correct.toLowerCase();
    const inputEl = document.getElementById('ans-input');
    inputEl.disabled = true;
    document.getElementById('submit-ans').disabled = true;
    
    if (isCorrect) {
        inputEl.style.borderColor = 'var(--success)';
        inputEl.style.color = 'var(--success)';
    } else {
        inputEl.style.borderColor = 'var(--danger)';
        inputEl.style.color = 'var(--danger)';
    }
    handleAnswerResult(isCorrect, correct);
};

function handleAnswerResult(isCorrect, correctAnswerText) {
    const task = quizQueue[0];
    const feedback = document.getElementById('feedback');

    if (isCorrect) {
        feedback.textContent = "✅正确！";
        feedback.className = "feedback-msg correct";
        if (currentMode === 'study' || currentMode === 'test') {
             quizQueue.shift();
        } else if (currentMode === 'dictation') {
            task.count++;
            if (task.count >= 2) quizQueue.shift();
            else {
                quizQueue.push(quizQueue.shift());
                quizStats.total++;
            }
        }
    } else {
        feedback.innerHTML = `❌ 正确答案：${correctAnswerText} <span onclick="window.speak('${task.word.es}')" style="cursor:pointer">🔊</span>`;
        feedback.className = "feedback-msg wrong";
        
        if (!quizStats.errors[task.word.id]) quizStats.errors[task.word.id] = 0;
        quizStats.errors[task.word.id]++;

        if (currentMode === 'study') {
            quizQueue.push(quizQueue.shift());
        } else if (currentMode === 'test') {
            quizQueue.shift();
            ['es_zh', 'zh_es', 'spell', 'audio_zh', 'audio_spell'].forEach(type => {
                quizQueue.push({ word: task.word, type, solved: false });
            });
            quizStats.total += 5; 
        } else if (currentMode === 'dictation') {
            quizQueue.push(quizQueue.shift());
            quizStats.total++;
        }
        audioService.speak(task.word.es);
    }

    setTimeout(() => {
        renderQuiz();
    }, isCorrect ? 800 : 2500);
}

function renderResult() {
    const errorList = Object.entries(quizStats.errors)
        .sort((a, b) => b[1] - a[1])
        .map(([id, count]) => {
            const w = currentWords.find(cw => cw.id === id);
            return w ? `<div class="result-item"><span>${w.es}</span><span>错误 ${count} 次</span></div>` : '';
        }).join('');

    appContainer.innerHTML = `
        <div class="card" style="max-width:600px; margin:0 auto;">
            <h2 style="color:var(--primary)">🎉 完成！</h2>
            <div style="font-size:3rem; color:var(--text-main); font-weight:800; margin:1rem 0;">
                ${Math.max(0, 100 - (Object.keys(quizStats.errors).length * 10))}%
            </div>
            
            ${errorList ? `<h3>错题本</h3><div style="text-align:left; margin-top:1rem;">${errorList}</div>` : '<p style="color:var(--success); font-weight:bold">全对！太棒了！</p>'}

            <button class="btn btn-primary" onclick="location.hash='#home'" style="margin-top:2rem;">返回首页</button>
        </div>
    `;
}