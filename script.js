const frequency = document.querySelector('#frequency');
const frequencyValue = document.querySelector('#frequencyValue');
const coreCountInput = document.querySelector('#coreCount');
const coreValue = document.querySelector('#coreValue');
const showCoresInput = document.querySelector('#showCores');
const coreSettings = document.querySelector('#coreSettings');
const threadCountInput = document.querySelector('#threadCount');
const threadValue = document.querySelector('#threadValue');
const showThreadsInput = document.querySelector('#showThreads');
const threadSettings = document.querySelector('#threadSettings');
const threadToggle = document.querySelector('#threadToggle');
const queueList = document.querySelector('#queueList');
const chipShell = document.querySelector('#chipShell');
const coreGrid = document.querySelector('#coreGrid');
const resultList = document.querySelector('#resultList');

const instructions = [
  { code: 'SEČTENÍ', result: 'Výsledek: 12' },
  { code: 'NAČTENÍ DAT', result: 'Načteno: 42', waitsForMemory: true },
  { code: 'POROVNÁNÍ', result: 'Shodné' },
  { code: 'ULOŽENÍ DAT', result: 'Uloženo', waitsForMemory: true },
  { code: 'NÁSOBENÍ', result: 'Výsledek: 24' },
  { code: 'SKOK', result: 'Skok proveden' },
  { code: 'ODEČTENÍ', result: 'Výsledek: 3' },
  { code: 'PŘESUN DAT', result: 'Přesunuto' }
];

let nextInstruction = 4;
let coreCount = 1;
let threadCount = 2;
let showCores = false;
let showThreads = false;
let motionDuration = 5040;
let queueIsMoving = false;
let simulationVersion = 0;
let scheduledJobs = new Set();
let threadSlots = [];
let coreStates = new Map();

const MEMORY_WAIT_MULTIPLIER = 2.1;

function makeCard(instruction) {
  const card = document.createElement('div');
  card.className = 'queue-card';
  card.textContent = instruction.code;
  card.dataset.code = instruction.code;
  card.dataset.result = instruction.result;
  return card;
}

function fillQueue() {
  queueList.replaceChildren(...instructions.slice(0, 4).map(makeCard));
}

function coreNoun(count) {
  return count === 1 ? 'jádro' : 'jádra';
}

function threadNoun(count) {
  return count === 1 ? 'vlákno' : 'vlákna';
}

function schedule(callback, delay) {
  const timer = window.setTimeout(() => {
    scheduledJobs.delete(timer);
    callback();
  }, delay);
  scheduledJobs.add(timer);
  return timer;
}

function clearScheduledJobs() {
  scheduledJobs.forEach(timer => window.clearTimeout(timer));
  scheduledJobs.clear();
}

function addProcessingSlot({ coreIndex, threadIndex, core, coreState, element, viewClass }) {
  threadSlots.push({
    coreIndex,
    threadIndex,
    core,
    coreState,
    element,
    viewClass,
    busy: false,
    instruction: null,
    instructionBox: null,
    memoryRequested: false,
    memoryResolved: false
  });
}

function renderCores() {
  threadSlots = [];
  coreStates = new Map();
  coreGrid.replaceChildren();
  const view = !showCores ? 'processor' : showThreads ? 'threads' : 'cores';
  chipShell.dataset.view = view;
  chipShell.dataset.coreCount = String(showCores ? coreCount : 1);
  chipShell.style.setProperty('--core-columns', '1');
  chipShell.style.setProperty('--core-rows', String(showCores ? coreCount : 1));
  chipShell.style.setProperty('--thread-rows', String(showThreads ? threadCount : 1));

  if (!showCores) {
    const processorTask = document.createElement('div');
    processorTask.className = 'processor-task idle';
    processorTask.innerHTML = '<div class="instruction-slot"></div>';
    const coreState = { core: chipShell, unit: null, unitBusy: false, activeSlot: null };
    coreGrid.append(processorTask);
    coreStates.set(chipShell, coreState);
    addProcessingSlot({
      coreIndex: 0,
      threadIndex: 0,
      core: chipShell,
      coreState,
      element: processorTask,
      viewClass: 'processor-task'
    });
    return;
  }

  coreGrid.replaceChildren(...Array.from({ length: coreCount }, (_, coreIndex) => {
    const core = document.createElement('article');
    core.className = showThreads ? 'core-card' : 'core-card simple-core';
    core.dataset.core = String(coreIndex + 1);
    core.dataset.threadCount = String(showThreads ? threadCount : 0);
    core.innerHTML = showThreads
      ? `<div class="core-card-header"><span>JÁDRO ${coreIndex + 1}</span></div><div class="core-workspace"><div class="thread-list"></div><div class="shared-unit"><span>VÝPOČETNÍ<br />JEDNOTKA</span></div></div>`
      : `<div class="core-card-header"><span>JÁDRO ${coreIndex + 1}</span></div><div class="core-workspace core-simple-workspace"><div class="core-task idle"><div class="instruction-slot"></div></div></div>`;
    const coreState = {
      core,
      unit: core.querySelector('.shared-unit'),
      unitBusy: false,
      activeSlot: null
    };
    coreStates.set(core, coreState);

    if (!showThreads) {
      addProcessingSlot({
        coreIndex: coreIndex + 1,
        threadIndex: 0,
        core,
        coreState,
        element: core.querySelector('.core-task'),
        viewClass: 'core-task'
      });
      return core;
    }

    const threadList = core.querySelector('.thread-list');
    Array.from({ length: threadCount }, (_, threadIndex) => {
      const element = document.createElement('article');
      element.className = 'thread-card idle';
      element.dataset.core = String(coreIndex + 1);
      element.dataset.thread = String(threadIndex + 1);
      element.innerHTML = `<div class="thread-card-meta"><span>VLÁKNO ${threadIndex + 1}</span><span class="thread-status">VOLNÉ</span></div><div class="instruction-slot"></div>`;
      threadList.append(element);
      addProcessingSlot({
        coreIndex: coreIndex + 1,
        threadIndex: threadIndex + 1,
        core,
        coreState,
        element,
        viewClass: 'thread-card'
      });
    });
    return core;
  }));
}

function resetResultArea() {
  resultList.replaceChildren();
}

function updateCoreActivity(core) {
  if (!core.classList.contains('core-card')) return;
  const hasActiveWork = [...core.querySelectorAll('.thread-card, .core-task')].some(item => !item.classList.contains('idle'));
  core.classList.toggle('working', hasActiveWork);
}

function setSharedUnitState(coreState, slot) {
  coreState.unit?.classList.toggle('active', Boolean(slot));
}

function setThreadState(slot, state, instruction) {
  const status = slot.element.querySelector('.thread-status');
  slot.element.className = `${slot.viewClass} ${state}`;

  if (!status) {
    updateCoreActivity(slot.core);
    return;
  }

  if (state === 'idle') {
    status.textContent = 'VOLNÉ';
  } else if (state === 'waiting') {
    status.textContent = 'ČEKÁ NA DATA';
  } else if (state === 'receiving') {
    status.textContent = 'PŘIJÍMÁ';
  } else if (state === 'ready') {
    status.textContent = 'ČEKÁ NA JEDNOTKU';
  } else {
    status.textContent = 'VYUŽÍVÁ JEDNOTKU';
  }

  updateCoreActivity(slot.core);
}

function placeInstructionInThread(slot, instruction) {
  slot.instructionBox?.remove();
  const box = document.createElement('div');
  box.className = 'thread-instruction';
  box.textContent = instruction.code;
  slot.element.querySelector('.instruction-slot').append(box);
  slot.instructionBox = box;
}

function clearInstructionFromThread(slot) {
  slot.instructionBox?.remove();
  slot.instructionBox = null;
}

function documentRectangle(element) {
  const rectangle = element.getBoundingClientRect();
  return {
    left: rectangle.left + window.scrollX,
    top: rectangle.top + window.scrollY,
    width: rectangle.width,
    height: rectangle.height,
    bottom: rectangle.bottom + window.scrollY
  };
}

function alignFlyingInstruction(flyer) {
  flyer.style.left = `${Number(flyer.dataset.originLeft) - window.scrollX}px`;
  flyer.style.top = `${Number(flyer.dataset.originTop) - window.scrollY}px`;
}

function placeFlyingInstruction(flyer, origin) {
  flyer.dataset.originLeft = String(origin.left);
  flyer.dataset.originTop = String(origin.top);
  alignFlyingInstruction(flyer);
}

function animateCompletedInstruction(instruction, originInstruction, duration) {
  const origin = documentRectangle(originInstruction);
  const destination = documentRectangle(resultList);
  const flyer = originInstruction.cloneNode(true);
  flyer.className = 'completed-card';
  flyer.setAttribute('aria-hidden', 'true');
  flyer.textContent = instruction.code;
  placeFlyingInstruction(flyer, origin);
  flyer.style.width = `${origin.width}px`;
  flyer.style.setProperty('--flight-duration', `${duration}ms`);
  flyer.style.setProperty('--fade-duration', `${Math.round(duration * 0.28)}ms`);
  flyer.style.transform = 'translate3d(0, 0, 0)';
  document.body.append(flyer);

  // Nejdřív necháme prohlížeč vykreslit instrukci přímo ve vlákně.
  // Teprve potom začne přechod směrem k hotovému výsledku.
  void flyer.offsetWidth;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      flyer.style.transform = `translate3d(${destination.left - origin.left + destination.width / 2 - origin.width / 2}px, ${destination.top - origin.top + destination.height / 2 - origin.height / 2}px, 0)`;
    });
  });

  schedule(() => {
    flyer.style.opacity = '0';
    schedule(() => flyer.remove(), Math.round(duration * 0.28));
  }, duration);
}

function createInboundFlyer(card, targetThread) {
  const source = documentRectangle(card);
  const holder = documentRectangle(targetThread.querySelector('.instruction-slot'));
  const target = {
    left: holder.left,
    top: holder.bottom - source.height,
    width: source.width,
    height: source.height
  };
  const flyer = card.cloneNode(true);
  flyer.className = 'travelling-card';
  placeFlyingInstruction(flyer, source);
  flyer.style.width = `${source.width}px`;
  document.body.append(flyer);
  return { flyer, source, target };
}

function animateQueueShift(cards, slots, version) {
  queueIsMoving = true;
  const queueDuration = Math.max(1000, Math.round(motionDuration * 0.55));
  const dispatches = cards.map((card, index) => ({
    card,
    instruction: instructions.find(instruction => instruction.code === card.dataset.code),
    slot: slots[index]
  }));
  const inbound = dispatches.map(({ card, slot }) => {
    const movement = createInboundFlyer(card, slot.element);
    movement.flyer.style.transitionDuration = `${queueDuration}ms`;
    return { ...movement, slot };
  });
  const dispatchedSet = new Set(cards);
  const remaining = [...queueList.children].filter(card => !dispatchedSet.has(card));
  const before = new Map(remaining.map(card => [card, card.getBoundingClientRect()]));

  cards.forEach(card => card.remove());
  const freshCards = Array.from({ length: cards.length }, () => {
    const card = makeCard(instructions[nextInstruction % instructions.length]);
    nextInstruction += 1;
    return card;
  });
  [...freshCards].reverse().forEach(card => queueList.prepend(card));

  remaining.forEach(card => {
    const oldBox = before.get(card);
    const newBox = card.getBoundingClientRect();
    card.animate([{ transform: `translateY(${oldBox.top - newBox.top}px)` }, { transform: 'translateY(0)' }], {
      duration: queueDuration,
      easing: 'cubic-bezier(.2,.75,.25,1)',
      fill: 'none'
    });
  });
  freshCards.forEach((card, index) => {
    const box = card.getBoundingClientRect();
    card.animate([{ transform: `translateY(-${(box.height + 9) * cards.length}px)`, opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], {
      duration: queueDuration,
      delay: index * 45,
      easing: 'cubic-bezier(.2,.75,.25,1)',
      fill: 'none'
    });
  });

  requestAnimationFrame(() => {
    inbound.forEach(({ flyer, source, target }) => {
      flyer.style.transform = `translate(${target.left - source.left}px, ${target.top - source.top}px)`;
      flyer.style.opacity = '1';
    });
  });

  schedule(() => {
    if (version !== simulationVersion) return;
    inbound.forEach(({ flyer }) => flyer.remove());
    dispatches.forEach(dispatch => placeInstructionInThread(dispatch.slot, dispatch.instruction));
    dispatches.forEach(dispatch => startExecution(dispatch, version));
    chipShell.classList.remove('active');
    void chipShell.offsetWidth;
    chipShell.classList.add('active');
    queueIsMoving = false;
    dispatchAvailable();
  }, queueDuration);
}

function startExecution(dispatch, version) {
  const { slot, instruction } = dispatch;
  if (version !== simulationVersion || !slot.busy) return;
  slot.instruction = instruction;
  setThreadState(slot, 'ready', instruction);
  useAvailableUnit(slot.coreState, version);
}

function useAvailableUnit(coreState, version) {
  if (version !== simulationVersion || coreState.unitBusy) return;
  const slot = threadSlots.find(candidate => candidate.coreState === coreState && candidate.busy && candidate.element.classList.contains('ready'));

  if (!slot) {
    setSharedUnitState(coreState, null);
    return;
  }

  coreState.unitBusy = true;
  coreState.activeSlot = slot;
  setThreadState(slot, 'working', slot.instruction);
  setSharedUnitState(coreState, slot);

  if (showThreads && slot.instruction.waitsForMemory && !slot.memoryResolved) {
    slot.memoryRequested = true;
    schedule(() => beginMemoryWait(slot, version), Math.round(motionDuration * 0.22));
    return;
  }

  schedule(() => finishExecution(slot, version), Math.round(motionDuration * 0.48));
}

function beginMemoryWait(slot, version) {
  const { coreState } = slot;
  if (version !== simulationVersion || !slot.busy || coreState.activeSlot !== slot) return;

  coreState.unitBusy = false;
  coreState.activeSlot = null;
  setThreadState(slot, 'waiting', slot.instruction);
  setSharedUnitState(coreState, null);
  useAvailableUnit(coreState, version);

  // Čekání na paměť je dost dlouhé na to, aby druhé vlákno stihlo
  // přijmout a dokončit dvě rychlé instrukce.
  schedule(() => {
    if (version !== simulationVersion || !slot.busy) return;
    slot.memoryResolved = true;
    setThreadState(slot, 'ready', slot.instruction);
    useAvailableUnit(coreState, version);
  }, Math.round(motionDuration * MEMORY_WAIT_MULTIPLIER));
}

function finishExecution(slot, version) {
  const { coreState, instruction } = slot;
  if (version !== simulationVersion || coreState.activeSlot !== slot) return;
  animateCompletedInstruction(instruction, slot.instructionBox || slot.element, Math.round(motionDuration * 0.55));
  clearInstructionFromThread(slot);
  slot.busy = false;
  slot.instruction = null;
  slot.memoryRequested = false;
  slot.memoryResolved = false;
  coreState.unitBusy = false;
  coreState.activeSlot = null;
  setThreadState(slot, 'idle');
  setSharedUnitState(coreState, null);
  useAvailableUnit(coreState, version);
  schedule(() => dispatchAvailable(), 120);
}

function dispatchAvailable() {
  if (queueIsMoving) return;
  const freeSlots = threadSlots.filter(slot => !slot.busy);
  if (!freeSlots.length || !queueList.children.length) return;

  const selectedSlots = freeSlots.slice(0, queueList.children.length);
  const availableCards = [...queueList.children];
  const cards = selectedSlots.map(slot => {
    const siblingWaitsForData = threadSlots.some(candidate => (
      candidate.coreState === slot.coreState
      && candidate !== slot
      && candidate.busy
      && (candidate.element.classList.contains('waiting')
        || (candidate.instruction?.waitsForMemory && !candidate.memoryResolved))
    ));
    const fastCard = siblingWaitsForData
      ? availableCards.find(card => !instructions.find(instruction => instruction.code === card.dataset.code).waitsForMemory)
      : null;
    const card = fastCard || availableCards.at(-1);
    availableCards.splice(availableCards.indexOf(card), 1);
    return card;
  });
  const version = simulationVersion;
  selectedSlots.forEach((slot, index) => {
    slot.busy = true;
    const instruction = instructions.find(item => item.code === cards[index].dataset.code);
    slot.instruction = instruction;
    slot.memoryRequested = false;
    slot.memoryResolved = false;
    setThreadState(slot, 'receiving', instruction);
  });
  animateQueueShift(cards, selectedSlots, version);
}

function frequencyText(value) { return value.toFixed(1).replace('.', ','); }
function delayFor(value) { return Math.round(7200 - ((value - 1.2) / 4) * 3600); }

function updateFrequency() {
  const value = Number(frequency.value);
  const percent = ((value - 1.2) / 4) * 100;
  motionDuration = delayFor(value);
  frequencyValue.innerHTML = `${frequencyText(value)} <small>GHz</small>`;
  frequency.style.setProperty('--position', `${percent}%`);
  document.documentElement.style.setProperty('--motion', `${motionDuration}ms`);
}

function rebuildSimulation() {
  simulationVersion += 1;
  clearScheduledJobs();
  document.querySelectorAll('.travelling-card, .completed-card').forEach(card => card.remove());
  queueIsMoving = false;
  nextInstruction = 4;
  fillQueue();
  renderCores();
  resetResultArea();
  const version = simulationVersion;
  schedule(() => {
    if (version === simulationVersion) dispatchAvailable();
  }, 700);
}

function updateCoreCount() {
  coreCount = Number(coreCountInput.value);
  const percent = (coreCount - 1) * 100;
  coreValue.innerHTML = `${coreCount} <small>${coreNoun(coreCount)}</small>`;
  coreCountInput.style.setProperty('--core-position', `${percent}%`);
  rebuildSimulation();
}

function updateThreadCount() {
  threadCount = Number(threadCountInput.value);
  const percent = (threadCount - 1) * 100;
  threadValue.innerHTML = `${threadCount} <small>${threadNoun(threadCount)}</small>`;
  threadCountInput.style.setProperty('--thread-position', `${percent}%`);
  rebuildSimulation();
}

function updateHardwareVisibility() {
  showCores = showCoresInput.checked;
  if (!showCores) showThreadsInput.checked = false;
  showThreads = showCores && showThreadsInput.checked;

  coreSettings.hidden = !showCores;
  threadSettings.hidden = !showThreads;
  showThreadsInput.disabled = !showCores;
  threadToggle.classList.toggle('is-disabled', !showCores);
  rebuildSimulation();
}

frequency.addEventListener('input', updateFrequency);
coreCountInput.addEventListener('input', updateCoreCount);
threadCountInput.addEventListener('input', updateThreadCount);
showCoresInput.addEventListener('change', updateHardwareVisibility);
showThreadsInput.addEventListener('change', updateHardwareVisibility);
window.addEventListener('scroll', () => {
  document.querySelectorAll('.travelling-card, .completed-card').forEach(alignFlyingInstruction);
}, { passive: true });
updateFrequency();
updateCoreCount();
updateThreadCount();
updateHardwareVisibility();
