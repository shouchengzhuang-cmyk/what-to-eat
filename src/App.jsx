import { useEffect, useRef, useState } from 'react';
import { defaultFoods, tagGroups } from './defaults';

const STORAGE_KEY = 'what-to-eat-data-v1';
const tabs = [
  { id: 'recommend', label: '推荐' },
  { id: 'library', label: '菜单库' },
  { id: 'settings', label: '设置' },
];

const groupTitles = {
  meal: '餐次',
  scene: '场景',
  staple: '主食',
  taste: '口味',
  budget: '预算',
  mood: '状态',
};

const sceneOptions = ['到店', '宿舍'];
const allowedTags = new Set(Object.values(tagGroups).flat());
const requiredFoodTagGroups = new Set([...tagGroups.meal, ...tagGroups.scene]);
const typeTags = new Set(tagGroups.staple);
const exclusiveTagSets = [
  ['清淡', '口味适中', '重口'],
  ['辣', '不辣'],
  ['热乎', '冷食'],
  tagGroups.budget,
];

const emptyFood = {
  id: '',
  name: '',
  displayName: '',
  place: '',
  scene: '到店',
  area: '',
  floor: '',
  type: [],
  tags: [],
  reason: '',
  weight: 5,
  enabled: true,
  favorite: false,
  avoidUntil: null,
};

function cleanTags(tags) {
  if (!Array.isArray(tags)) return [];

  return tags.filter((tag) => allowedTags.has(tag)).reduce((current, tag) => {
    if (current.includes(tag)) return current;

    const exclusiveTags = getExclusiveTagSet(tag);
    if (exclusiveTags) {
      return [...current.filter((item) => !exclusiveTags.includes(item)), tag];
    }

    return [...current, tag];
  }, []);
}

function getExclusiveTagSet(tag) {
  return exclusiveTagSets.find((tags) => tags.includes(tag)) || null;
}

function togglePresetTag(tags, tag) {
  if (!allowedTags.has(tag)) return tags;
  if (tags.includes(tag)) return tags.filter((item) => item !== tag);

  const exclusiveTags = getExclusiveTagSet(tag);
  if (exclusiveTags) {
    return [...tags.filter((item) => !exclusiveTags.includes(item)), tag];
  }

  return [...tags, tag];
}

function getInitialFoods() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.version === 1 && Array.isArray(saved.foods)) {
      return normalizeFoods(saved.foods);
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
  return normalizeFoods(defaultFoods);
}

function normalizeFoods(foods) {
  return foods
    .map((food, index) => normalizeFood(food, index))
    .filter(Boolean);
}

function normalizeFood(food, index = 0) {
  if (!food || typeof food.name !== 'string') return null;

  const name = food.name.trim();
  if (!name) return null;

  const tags = cleanTags(food.tags);
  const place = typeof food.place === 'string' ? food.place.trim() : inferPlaceFromName(name);
  const scene = normalizeScene(food.scene, tags, place);
  const displayName = typeof food.displayName === 'string' && food.displayName.trim() ? food.displayName.trim() : name;
  const area = typeof food.area === 'string' && food.area.trim() ? food.area.trim() : inferArea(place);
  const floor = typeof food.floor === 'string' && food.floor.trim() ? food.floor.trim() : inferFloor(place, area);
  const type = normalizeType(food.type, tags, name);
  const weight = normalizeWeight(food.weight);
  const avoidUntil = typeof food.avoidUntil === 'string' && food.avoidUntil.trim() ? food.avoidUntil.trim() : null;

  return {
    id: food.id || `food-${Date.now()}-${index}`,
    name,
    displayName,
    place,
    scene,
    area,
    floor,
    type,
    tags,
    reason: typeof food.reason === 'string' && food.reason.trim() ? food.reason.trim() : '今天就吃它，简单省心。',
    weight,
    enabled: food.enabled !== false,
    favorite: Boolean(food.favorite),
    avoidUntil,
  };
}

function normalizeScene(scene, tags, place) {
  if (sceneOptions.includes(scene)) return scene;
  if (tags.includes('到店')) return '到店';
  if (tags.includes('宿舍')) return '宿舍';
  return place === '宿舍' ? '宿舍' : '到店';
}

function inferPlaceFromName(name) {
  const bracketPlace = name.match(/^(.+?)[（(]([^）)]+)[）)]$/)?.[2]?.trim();
  if (bracketPlace) return bracketPlace;
  const campusPlace = name.match(/^(西区|东区|芒果)(一楼|二楼|三楼)(.+)$/);
  return campusPlace ? `${campusPlace[1]}${campusPlace[2]}` : '';
}

function inferArea(place) {
  if (place.startsWith('西区')) return '西区食堂';
  if (place.startsWith('东区')) return '东区食堂';
  if (place.startsWith('芒果')) return '芒果';
  if (place === '宿舍') return '宿舍';
  if (place) return '校外';
  return '';
}

function inferFloor(place, area) {
  const floor = place.match(/(一楼|二楼|三楼)/)?.[1];
  if (floor) return floor;
  if (area === '宿舍') return '宿舍';
  if (area === '校外') return '校外';
  return '';
}

function normalizeType(type, tags, name) {
  const rawTypes = Array.isArray(type) ? type : typeof type === 'string' ? type.split(/[,，]/) : [];
  const inferredTypes = tags.filter((tag) => typeTags.has(tag));
  if (name.includes('汤') || name.includes('火锅鸡')) {
    inferredTypes.push('汤类');
  }

  return [...new Set([...rawTypes, ...inferredTypes].map((item) => String(item).trim()).filter(Boolean))];
}

function normalizeWeight(weight) {
  const value = Number(weight);
  if (!Number.isFinite(value)) return 5;
  return Math.min(10, Math.max(1, Math.round(value)));
}

function weightedRandomPick(candidates) {
  if (candidates.length === 0) return null;

  const weightedCandidates = candidates.map((food) => ({
    food,
    weight: normalizeWeight(food.weight),
  }));
  const totalWeight = weightedCandidates.reduce((total, item) => total + item.weight, 0);
  let randomPoint = Math.random() * totalWeight;

  for (const item of weightedCandidates) {
    randomPoint -= item.weight;
    if (randomPoint < 0) return item.food;
  }

  return weightedCandidates.at(-1)?.food || null;
}

function getGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 6) return '凌晨好！想吃点什么？';
  if (hour < 9) return '早上好！想吃点什么？';
  if (hour < 12) return '上午好！想吃点什么？';
  if (hour < 18) return '下午好！想吃点什么？';
  return '晚上好！想吃点什么？';
}

function getFoodDisplayParts(food) {
  const name = typeof food?.name === 'string' ? food.name.trim() : '';
  const displayName = typeof food?.displayName === 'string' ? food.displayName.trim() : '';
  const place = typeof food?.place === 'string' ? food.place.trim() : '';
  const bracketMatch = name.match(/^(.+?)[（(]([^）)]+)[）)]$/);
  const campusPlaceMatch = name.match(/^(西区|东区|芒果)(一楼|二楼|三楼)(.+)$/);
  const fallbackTitle = bracketMatch?.[1]?.trim() || campusPlaceMatch?.[3]?.trim() || name;
  const fallbackSubtitle = bracketMatch?.[2]?.trim() || (campusPlaceMatch ? `${campusPlaceMatch[1]}${campusPlaceMatch[2]}` : '');

  return {
    title: displayName || fallbackTitle,
    subtitle: place || fallbackSubtitle,
  };
}

function getResultLocation(food) {
  const place = typeof food?.place === 'string' ? food.place.trim() : '';
  if (place) return place;

  return [food?.area, food?.floor].map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean).join(' · ');
}

function getResultTags(food) {
  const typeSet = new Set(food.type || []);
  const hiddenTags = new Set([...sceneOptions, ...tagGroups.meal, ...typeSet]);
  const locationParts = [food.place, food.area, food.floor].map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean);

  return (food.tags || [])
    .filter((tag) => !hiddenTags.has(tag))
    .filter((tag) => !locationParts.some((part) => part.includes(tag) || tag.includes(part)))
    .slice(0, 4);
}

function getMealInfoByTime(date = new Date()) {
  const totalMinutes = date.getHours() * 60 + date.getMinutes();

  if (totalMinutes >= 6 * 60 && totalMinutes < 10 * 60) {
    return { tags: ['早餐'], label: '早餐', hint: '现在适合来点早餐。' };
  }

  if (totalMinutes >= 10 * 60 && totalMinutes < 21 * 60) {
    return { tags: ['正餐'], label: '正餐', hint: '这一顿交给它决定。' };
  }

  return { tags: ['夜宵'], label: '夜宵', hint: '这个点就别太正式了，来点夜宵。' };
}

function App() {
  const [activeTab, setActiveTab] = useState('recommend');
  const [foods, setFoods] = useState(getInitialFoods);
  const [selectedScene, setSelectedScene] = useState('');
  const [roundMealInfo, setRoundMealInfo] = useState(null);
  const [isResultMode, setIsResultMode] = useState(false);
  const [currentFood, setCurrentFood] = useState(null);
  const [lastFoodId, setLastFoodId] = useState(null);
  const [skippedFoodIds, setSkippedFoodIds] = useState([]);
  const [toast, setToast] = useState({ id: 0, message: '', visible: false });
  const [editingFood, setEditingFood] = useState(null);
  const [settingsMessage, setSettingsMessage] = useState('');

  const recommendationPool = selectedScene ? foods.filter((food) => food.enabled && food.scene === selectedScene) : [];

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, foods }));
  }, [foods]);

  useEffect(() => {
    if (currentFood) {
      setCurrentFood(foods.find((food) => food.id === currentFood.id) || null);
    }
  }, [foods, currentFood]);

  useEffect(() => {
    if (!toast.message) return undefined;

    const fadeTimer = window.setTimeout(() => {
      setToast((current) => (current.id === toast.id ? { ...current, visible: false } : current));
    }, 1700);
    const clearTimer = window.setTimeout(() => {
      setToast((current) => (current.id === toast.id ? { id: current.id, message: '', visible: false } : current));
    }, 2050);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(clearTimer);
    };
  }, [toast.id, toast.message]);

  const showToast = (message) => {
    if (!message) {
      setToast((current) => ({ id: current.id + 1, message: '', visible: false }));
      return;
    }

    setToast((current) => ({ id: current.id + 1, message, visible: true }));
  };

  const clearToast = () => {
    setToast((current) => ({ id: current.id + 1, message: '', visible: false }));
  };

  const switchTab = (tabId) => {
    clearToast();
    setActiveTab(tabId);
  };

  const selectScene = (scene) => {
    setSelectedScene(scene);
    setCurrentFood(null);
    setIsResultMode(false);
    setSkippedFoodIds([]);
    setRoundMealInfo(null);
    clearToast();
  };

  const pickNextFood = (excludedFoodIds = skippedFoodIds, excludedFoodId = lastFoodId, mealInfo = roundMealInfo) => {
    const available = recommendationPool.filter((food) => !excludedFoodIds.includes(food.id));
    const pool = available.length > 1 ? available.filter((food) => food.id !== excludedFoodId) : available;
    const next = weightedRandomPick(pool);
    return { next };
  };

  const randomRecommend = ({ resetSkipped = false } = {}) => {
    if (!selectedScene) {
      showToast('先选到店或宿舍，再随机。');
      return;
    }

    const nextSkippedFoodIds = resetSkipped ? [] : skippedFoodIds;
    const nextMealInfo = getMealInfoByTime();
    const mealInfo = resetSkipped ? nextMealInfo : roundMealInfo;
    const { next } = pickNextFood(nextSkippedFoodIds, lastFoodId, mealInfo);

    if (!next) {
      setCurrentFood(null);
      setIsResultMode(nextSkippedFoodIds.length > 0);
      showToast(nextSkippedFoodIds.length > 0 ? 'bro，这一轮快被你划完了，重新开始吧。' : '这个条件下没有可推荐的，换个条件试试。');
      return;
    }

    if (resetSkipped) {
      setSkippedFoodIds([]);
      setRoundMealInfo(nextMealInfo);
    }
    setCurrentFood(next);
    setIsResultMode(true);
    setLastFoodId(next.id);
    showToast('');
  };

  const updateFood = (id, patch) => {
    setFoods((current) => current.map((food) => (food.id === id ? { ...food, ...patch } : food)));
  };

  const skipCurrentFood = () => {
    if (!currentFood) return;
    const nextSkippedFoodIds = [...new Set([...skippedFoodIds, currentFood.id])];
    const { next } = pickNextFood(nextSkippedFoodIds, currentFood.id);

    setSkippedFoodIds(nextSkippedFoodIds);
    setCurrentFood(next);
    if (next) {
      setLastFoodId(next.id);
      showToast('已划掉，换一个。');
    } else {
      setIsResultMode(true);
      showToast('bro，这一轮快被你划完了，重新开始吧。');
    }
  };

  const toggleCurrentFavorite = () => {
    if (!currentFood) return;
    const nextFavorite = !currentFood.favorite;
    updateFood(currentFood.id, { favorite: nextFavorite });
    showToast(nextFavorite ? '已加入常吃。' : '已取消常吃。');
  };

  const saveFood = (foodToSave) => {
    const nextFood = normalizeFood(foodToSave);

    if (!nextFood) return '食物名称不能为空。';
    if (!nextFood.reason) return '推荐理由不能为空。';
    if (!sceneOptions.includes(nextFood.scene)) return '请选择到店或宿舍。';
    if (!nextFood.tags.some((tag) => requiredFoodTagGroups.has(tag))) return '至少选择一个餐次或场景标签。';
    if (!foodToSave.id) nextFood.id = `food-${Date.now()}`;

    setFoods((current) => {
      if (foodToSave.id) {
        return current.map((food) => (food.id === foodToSave.id ? nextFood : food));
      }
      return [nextFood, ...current];
    });
    setEditingFood(null);
    return '';
  };

  const exportData = () => {
    const data = JSON.stringify({ version: 1, foods }, null, 2);
    const date = new Date().toISOString().slice(0, 10);
    const blob = new Blob([data], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `what-to-eat-backup-${date}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setSettingsMessage('已下载 JSON 备份文件。');
  };

  const importData = async (file) => {
    if (!file) return;

    try {
      const parsed = JSON.parse(await file.text());
      if (parsed?.version !== 1 || !Array.isArray(parsed.foods)) {
        throw new Error('Invalid format');
      }
      setFoods(normalizeFoods(parsed.foods));
      setSettingsMessage('已导入 JSON 备份。');
    } catch {
      setSettingsMessage('导入失败，请检查 JSON 文件。');
    }
  };

  const resetDefault = () => {
    setFoods(defaultFoods);
    setCurrentFood(null);
    setIsResultMode(false);
    setSkippedFoodIds([]);
    setRoundMealInfo(null);
    setSelectedScene('');
    setSettingsMessage('已恢复默认菜单。');
  };

  const clearAll = () => {
    setFoods([]);
    setCurrentFood(null);
    setIsResultMode(false);
    setSkippedFoodIds([]);
    setRoundMealInfo(null);
    setSelectedScene('');
    setSettingsMessage('已清空全部数据。');
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col overflow-x-hidden px-5 pb-24 pt-4">
      <main className="flex-1">
        {activeTab === 'recommend' && (
          <RecommendPage
            isResultMode={isResultMode}
            currentFood={currentFood}
            selectedScene={selectedScene}
            candidateCount={recommendationPool.length}
            onSelectScene={selectScene}
            mealInfo={roundMealInfo}
            homeMealInfo={getMealInfoByTime()}
            onRandom={() => randomRecommend({ resetSkipped: true })}
            onRestart={() => randomRecommend({ resetSkipped: true })}
            onBackHome={() => {
              setCurrentFood(null);
              setIsResultMode(false);
              setSkippedFoodIds([]);
              setRoundMealInfo(null);
              clearToast();
            }}
            onSkip={skipCurrentFood}
            onToggleFavorite={toggleCurrentFavorite}
          />
        )}
        {activeTab === 'library' && (
          <LibraryPage
            foods={foods}
            editingFood={editingFood}
            setEditingFood={setEditingFood}
            onSave={saveFood}
            onDelete={(id) => setFoods((current) => current.filter((food) => food.id !== id))}
            onToggleFavorite={(food) => updateFood(food.id, { favorite: !food.favorite })}
          />
        )}
        {activeTab === 'settings' && (
          <SettingsPage
            message={settingsMessage}
            onExport={exportData}
            onImport={importData}
            onResetDefault={resetDefault}
            onClearAll={clearAll}
          />
        )}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-800/40 bg-slate-950/95 px-5 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur">
        <div className="mx-auto grid max-w-[430px] grid-cols-3 gap-1.5">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => switchTab(tab.id)}
              className={`h-11 rounded-xl text-xs font-semibold transition ${
                activeTab === tab.id
                  ? 'bg-amber-400 text-slate-950'
                  : 'bg-white/[0.04] text-slate-400 active:bg-white/10'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {toast.message && (
        <div
          className={`fixed inset-x-5 bottom-20 z-50 mx-auto max-w-[390px] rounded-2xl bg-slate-950/85 px-4 py-2.5 text-center text-sm text-amber-100 shadow-glow backdrop-blur transition-opacity duration-300 ${
            toast.visible ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}

function RecommendPage({
  isResultMode,
  currentFood,
  selectedScene,
  candidateCount,
  onSelectScene,
  mealInfo,
  homeMealInfo,
  onRandom,
  onRestart,
  onBackHome,
  onSkip,
  onToggleFavorite,
}) {
  const touchStartRef = useRef(null);
  const lastTapTimeRef = useRef(0);
  const lastFavoriteToggleAtRef = useRef(0);
  const [isSwipingAway, setIsSwipingAway] = useState(false);

  const toggleFavoriteOnce = () => {
    const now = Date.now();
    if (now - lastFavoriteToggleAtRef.current < 350) return;
    lastFavoriteToggleAtRef.current = now;
    onToggleFavorite();
  };

  const handleResultTouchStart = (event) => {
    const touch = event.touches[0];
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
    };
  };

  const handleResultTouchEnd = (event) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start || isSwipingAway) return;

    const touch = event.changedTouches[0];
    const distanceY = start.y - touch.clientY;
    const distanceX = Math.abs(touch.clientX - start.x);

    if (distanceY > 44 && distanceY > distanceX * 1.25) {
      setIsSwipingAway(true);
      window.setTimeout(() => {
        onSkip();
        setIsSwipingAway(false);
      }, 180);
      return;
    }

    if (Math.abs(distanceY) > 14 || distanceX > 14) return;

    const now = Date.now();
    if (now - lastTapTimeRef.current < 320) {
      toggleFavoriteOnce();
      lastTapTimeRef.current = 0;
    } else {
      lastTapTimeRef.current = now;
    }
  };

  if (!isResultMode) {
    return (
      <section className="flex min-h-[calc(100vh-8rem)] flex-col pb-3">
        <div className="flex flex-1 flex-col justify-center py-6">
          <header className="text-center">
            <p className="text-sm font-semibold text-amber-200">{selectedScene ? getGreeting() : '今天吃什么？'}</p>
            <h1 className="mt-2 text-[2.35rem] font-bold leading-tight tracking-normal text-white">今天吃什么？</h1>
            <p className="mt-3 text-sm font-normal text-slate-400">先选场景，再交给随机。</p>
          </header>

          <div className="mt-10 grid grid-cols-2 gap-3">
            {sceneOptions.map((scene) => (
              <button
                key={scene}
                type="button"
                onClick={() => onSelectScene(scene)}
                className={`h-24 rounded-[1.4rem] border px-4 text-lg font-bold transition active:scale-[0.99] ${
                  selectedScene === scene
                    ? 'border-amber-300 bg-amber-400 text-slate-950 shadow-glow'
                    : 'border-white/10 bg-white/[0.045] text-slate-200 active:bg-white/10'
                }`}
              >
                {scene}
              </button>
            ))}
          </div>

          {selectedScene && (
            <>
              <p className="mt-7 text-center text-sm font-semibold text-slate-400">当前可选：{candidateCount} 个</p>
              <button
                type="button"
                onClick={onRandom}
                disabled={candidateCount === 0}
                className={`mx-auto mt-4 h-16 w-full max-w-[19rem] rounded-[1.4rem] text-xl font-bold shadow-glow transition active:scale-[0.99] ${
                  candidateCount === 0 ? 'cursor-not-allowed bg-slate-700 text-slate-400 shadow-none' : 'bg-amber-400 text-slate-950'
                }`}
              >
                随机一下
              </button>
              <p className="mt-3 text-center text-xs text-slate-500">让它替你决定，别再纠结。</p>
            </>
          )}

          <p className="mt-6 text-center text-xs text-slate-600">
            {selectedScene ? `${selectedScene} · 当前时间是${homeMealInfo.label}` : '请选择到店或宿舍'}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      onTouchStart={handleResultTouchStart}
      onTouchEnd={handleResultTouchEnd}
      onDoubleClick={toggleFavoriteOnce}
      className="relative -mx-5 -mt-4 flex min-h-[calc(100vh-4.25rem)] touch-none select-none flex-col overflow-hidden px-5 pb-5 pt-6"
    >
      <ResultCard
        food={currentFood}
        resultContext={[selectedScene, mealInfo?.label].filter(Boolean).join(' · ')}
        isSwipingAway={isSwipingAway}
        onRestart={onRestart}
        onBackHome={onBackHome}
      />
    </section>
  );
}

function ResultCard({ food, resultContext, isSwipingAway, onRestart, onBackHome }) {
  if (!food) {
    return (
      <div className="flex min-h-[70vh] flex-1 flex-col items-center justify-center rounded-[2rem] border border-dashed border-white/14 bg-white/[0.035] p-6 text-center">
        <p className="text-2xl font-bold text-white">这一轮快被你划完了</p>
        <p className="mt-3 text-sm leading-6 text-slate-400">重新开始，或者少选几个条件。</p>
        <button
          type="button"
          onClick={onRestart}
          className="mt-5 h-10 rounded-full px-5 text-sm font-medium text-amber-100 underline decoration-amber-200/25 underline-offset-4"
        >
          重新开始
        </button>
      </div>
    );
  }

  const title = food.displayName || food.name;
  const location = getResultLocation(food);
  const typeItems = (food.type || []).slice(0, 3);
  const tagItems = getResultTags(food);

  return (
    <article
      className={`relative flex min-h-[74vh] flex-1 flex-col justify-between rounded-[2rem] border border-amber-300/12 bg-gradient-to-b from-amber-300/[0.13] via-white/[0.035] to-white/[0.02] p-5 shadow-glow transition duration-200 ${
        isSwipingAway ? '-translate-y-16 opacity-0' : 'translate-y-0 opacity-100'
      }`}
    >
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onBackHome();
        }}
        aria-label="返回首页"
        className="absolute left-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.06] text-2xl font-light leading-none text-slate-300 transition active:bg-white/10"
      >
        ‹
      </button>
      <div>
        <div className="flex items-center justify-between gap-3 pl-10">
          <p className="text-sm font-medium text-amber-200">{resultContext || '这顿吃'}</p>
          {food.favorite && <span className="rounded-full bg-amber-300/90 px-2.5 py-1 text-xs font-bold text-slate-950">已常吃</span>}
        </div>
      </div>

      <div className="max-w-full py-6">
        <h2 className="max-w-full break-words text-5xl font-bold leading-tight tracking-normal text-white">{title}</h2>
        {location && (
          <p className="mt-3 max-w-full break-words text-base font-semibold leading-6 text-amber-100/80">位置：{location}</p>
        )}
        {typeItems.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2">
            {typeItems.map((item) => (
              <span key={item} className="rounded-full bg-white/[0.07] px-2.5 py-1 text-xs font-medium text-slate-200">
                {item}
              </span>
            ))}
          </div>
        )}
        {tagItems.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {tagItems.map((tag) => (
              <span key={tag} className="rounded-full bg-slate-900/70 px-2 py-0.5 text-[11px] font-medium text-slate-400">
                {tag}
              </span>
            ))}
          </div>
        )}
        <p className="mt-6 text-lg font-normal leading-8 text-slate-200">{food.reason}</p>
      </div>

      <div className="space-y-2 text-center">
        <p className="text-xs font-medium text-slate-500">上划换一个 · {food.favorite ? '双击取消常吃' : '双击常吃'}</p>
      </div>
    </article>
  );
}

function LibraryPage({ foods, editingFood, setEditingFood, onSave, onDelete, onToggleFavorite }) {
  const [sceneView, setSceneView] = useState('到店');
  const sceneCounts = {
    all: foods.length,
    到店: foods.filter((food) => food.scene === '到店').length,
    宿舍: foods.filter((food) => food.scene === '宿舍').length,
  };
  const groupedFoods = sceneOptions.map((scene) => ({
    scene,
    foods: foods.filter((food) => food.scene === scene),
  })).filter(({ scene }) => sceneView === '全部' || scene === sceneView);
  const viewOptions = [
    { id: '全部', label: '全部', count: sceneCounts.all },
    { id: '到店', label: '到店', count: sceneCounts.到店 },
    { id: '宿舍', label: '宿舍', count: sceneCounts.宿舍 },
  ];

  return (
    <section className="space-y-3">
      <PageHeader title="菜单库" subtitle="新增、编辑和整理你真正会吃的选项。" />
      <button
        type="button"
        onClick={() => setEditingFood(emptyFood)}
        className="h-11 rounded-xl bg-amber-400 px-5 text-sm font-bold text-slate-950"
      >
        新增食物
      </button>

      <div className="grid grid-cols-3 gap-1.5 rounded-2xl bg-slate-950/70 p-1">
        {viewOptions.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setSceneView(option.id)}
            className={`h-10 rounded-xl text-xs font-semibold transition ${
              sceneView === option.id ? 'bg-amber-400 text-slate-950' : 'text-slate-400 active:bg-white/[0.06]'
            }`}
          >
            {option.label} {option.count}
          </button>
        ))}
      </div>

      {editingFood && <FoodForm food={editingFood} setFood={setEditingFood} onSave={onSave} onCancel={() => setEditingFood(null)} />}

      <div className="space-y-5">
        {groupedFoods.map(({ scene, foods: sceneFoods }) => (
          <section key={scene} className="space-y-2.5">
            <div className="flex items-center justify-between border-b border-white/8 pb-2">
              <h2 className="text-base font-bold text-white">{scene}</h2>
              <span className="text-xs font-semibold text-slate-500">{sceneFoods.length}</span>
            </div>
            {sceneFoods.length === 0 ? (
              <EmptyState title={`暂无${scene}菜单`} text="可以从上方新增食物。" />
            ) : (
              sceneFoods.map((food) => (
                <FoodCard
                  key={food.id}
                  food={food}
                  setEditingFood={setEditingFood}
                  onDelete={onDelete}
                  onToggleFavorite={onToggleFavorite}
                />
              ))
            )}
          </section>
        ))}
      </div>
    </section>
  );
}

function FoodCard({ food, setEditingFood, onDelete, onToggleFavorite }) {
  return (
    <article className="rounded-2xl border border-white/8 bg-white/[0.045] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="break-words text-base font-semibold text-white">{food.name}</h2>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">{food.reason}</p>
        </div>
        {food.favorite && <span className="shrink-0 rounded-full bg-amber-300/90 px-2 py-0.5 text-[11px] font-bold text-slate-950">常吃</span>}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {food.tags.slice(0, 5).map((tag) => (
          <span key={tag} className="rounded-full bg-slate-800/80 px-2 py-0.5 text-[11px] font-medium text-slate-300">
            {tag}
          </span>
        ))}
        {food.tags.length > 5 && (
          <span className="rounded-full bg-slate-800/60 px-2 py-0.5 text-[11px] font-medium text-slate-500">
            +{food.tags.length - 5}
          </span>
        )}
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <SmallButton onClick={() => onToggleFavorite(food)}>{food.favorite ? '取消常吃' : '常吃'}</SmallButton>
        <SmallButton
          onClick={() =>
            setEditingFood(normalizeFood({
              ...food,
              tags: cleanTags(food.tags),
            }))
          }
        >
          编辑
        </SmallButton>
        <SmallButton danger onClick={() => onDelete(food.id)}>
          删除
        </SmallButton>
      </div>
    </article>
  );
}

function FoodForm({ food, setFood, onSave, onCancel }) {
  const [error, setError] = useState('');

  const handleSubmit = (event) => {
    event.preventDefault();
    const message = onSave(food);
    setError(message);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl border border-amber-300/20 bg-amber-300/8 p-3.5">
      <label className="block text-sm font-semibold text-slate-200">
        食物名称
        <input
          value={food.name}
          onChange={(event) => setFood({ ...food, name: event.target.value })}
          className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-sm text-white outline-none focus:border-amber-300"
          placeholder="例如：牛肉粉"
        />
      </label>
      <label className="block text-sm font-semibold text-slate-200">
        展示名称
        <input
          value={food.displayName}
          onChange={(event) => setFood({ ...food, displayName: event.target.value })}
          className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-sm text-white outline-none focus:border-amber-300"
          placeholder="例如：牛肉粉"
        />
      </label>
      <label className="block text-sm font-semibold text-slate-200">
        具体地点
        <input
          value={food.place}
          onChange={(event) => setFood({ ...food, place: event.target.value })}
          className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-sm text-white outline-none focus:border-amber-300"
          placeholder="例如：西区三楼"
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm font-semibold text-slate-200">
          场景
          <select
            value={food.scene}
            onChange={(event) => setFood({ ...food, scene: event.target.value })}
            className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-sm text-white outline-none focus:border-amber-300"
          >
            {sceneOptions.map((scene) => (
              <option key={scene} value={scene}>
                {scene}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-semibold text-slate-200">
          权重
          <input
            type="number"
            min="1"
            max="10"
            value={food.weight}
            onChange={(event) => setFood({ ...food, weight: event.target.value })}
            className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-sm text-white outline-none focus:border-amber-300"
          />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm font-semibold text-slate-200">
          区域
          <input
            value={food.area}
            onChange={(event) => setFood({ ...food, area: event.target.value })}
            className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-sm text-white outline-none focus:border-amber-300"
            placeholder="例如：西区食堂"
          />
        </label>
        <label className="block text-sm font-semibold text-slate-200">
          楼层
          <input
            value={food.floor}
            onChange={(event) => setFood({ ...food, floor: event.target.value })}
            className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-sm text-white outline-none focus:border-amber-300"
            placeholder="例如：三楼"
          />
        </label>
      </div>
      <label className="block text-sm font-semibold text-slate-200">
        类型
        <input
          value={(food.type || []).join(', ')}
          onChange={(event) => setFood({ ...food, type: event.target.value.split(/[,，]/).map((item) => item.trim()).filter(Boolean) })}
          className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-sm text-white outline-none focus:border-amber-300"
          placeholder="例如：米饭, 正餐"
        />
      </label>
      <label className="block text-sm font-semibold text-slate-200">
        推荐理由
        <textarea
          value={food.reason}
          onChange={(event) => setFood({ ...food, reason: event.target.value })}
          className="mt-2 min-h-20 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-300"
          placeholder="为什么这顿适合吃它？"
        />
      </label>
      <div className="space-y-3 rounded-xl bg-slate-950/70 p-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">标签选择</h3>
          <p className="mt-1 text-xs text-slate-500">只能从预设标签里选择，避免标签互相冲突。</p>
        </div>
        {Object.entries(tagGroups).map(([group, tags]) => (
          <div key={group}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h4 className="text-xs font-semibold text-slate-400">{groupTitles[group]}</h4>
              {group === 'taste' && <span className="text-[11px] text-slate-600">部分单选</span>}
              {group === 'budget' && <span className="text-[11px] text-slate-600">单选</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <TagButton
                  key={tag}
                  active={food.tags.includes(tag)}
                  onClick={() => setFood({ ...food, tags: togglePresetTag(food.tags, tag) })}
                >
                  {tag}
                </TagButton>
              ))}
            </div>
          </div>
        ))}
      </div>
      <label className="flex h-10 items-center gap-2.5 rounded-xl bg-slate-950 px-3 text-sm font-medium text-slate-200">
        <input
          type="checkbox"
          checked={food.enabled}
          onChange={(event) => setFood({ ...food, enabled: event.target.checked })}
          className="h-5 w-5 accent-amber-400"
        />
        启用推荐
      </label>
      <label className="flex h-10 items-center gap-2.5 rounded-xl bg-slate-950 px-3 text-sm font-medium text-slate-200">
        <input
          type="checkbox"
          checked={food.favorite}
          onChange={(event) => setFood({ ...food, favorite: event.target.checked })}
          className="h-5 w-5 accent-amber-400"
        />
        加入常吃
      </label>
      {error && <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</p>}
      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={onCancel} className="h-10 rounded-xl bg-slate-800 text-sm font-medium text-white">
          取消
        </button>
        <button type="submit" className="h-10 rounded-xl bg-amber-400 text-sm font-bold text-slate-950">
          保存
        </button>
      </div>
    </form>
  );
}

function SettingsPage({ message, onExport, onImport, onResetDefault, onClearAll }) {
  const [confirmAction, setConfirmAction] = useState(null);

  const confirmConfig =
    confirmAction === 'reset'
      ? {
          title: '确认恢复默认菜单？',
          body: '这会覆盖当前菜单数据。',
          confirmText: '确认恢复',
          danger: false,
          onConfirm: onResetDefault,
        }
      : confirmAction === 'clear'
        ? {
            title: '确认清空全部数据？',
            body: '这会删除当前所有菜单数据，操作不可撤销。',
            confirmText: '确认清空',
            danger: true,
            onConfirm: onClearAll,
          }
        : null;

  return (
    <section className="space-y-3">
      <PageHeader title="设置" subtitle="数据只保存在当前浏览器。" />

      <div className="space-y-3 rounded-2xl border border-white/8 bg-white/[0.045] p-3.5">
        <div>
          <h2 className="text-sm font-semibold text-white">数据备份</h2>
          <p className="mt-1 text-xs text-slate-500">导出后可以在其他设备导入。</p>
        </div>
        <button type="button" onClick={onExport} className="h-11 w-full rounded-xl bg-amber-400 text-sm font-bold text-slate-950">
          导出 JSON
        </button>
        <label className="flex h-11 w-full cursor-pointer items-center justify-center rounded-xl bg-white/10 text-sm font-semibold text-slate-100">
          导入 JSON
          <input
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(event) => {
              onImport(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
        </label>
      </div>

      <div className="space-y-3 rounded-2xl border border-red-400/10 bg-red-400/[0.035] p-3.5">
        <div>
          <h2 className="text-sm font-semibold text-white">危险操作</h2>
          <p className="mt-1 text-xs text-slate-500">会覆盖或移除当前菜单数据。</p>
        </div>
        <button type="button" onClick={() => setConfirmAction('reset')} className="h-10 w-full rounded-xl bg-slate-800/80 text-sm font-medium text-white">
          恢复默认菜单
        </button>
        <button type="button" onClick={() => setConfirmAction('clear')} className="h-10 w-full rounded-xl bg-red-500/75 text-sm font-semibold text-white">
          清空全部数据
        </button>
      </div>

      {message && (
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-2xl bg-slate-950 p-3 text-xs leading-5 text-slate-300">
          {message}
        </pre>
      )}

      {confirmConfig && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/70 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
          <div className="w-full max-w-[390px] rounded-3xl border border-white/10 bg-slate-950 p-4 shadow-glow">
            <h2 className="text-lg font-bold text-white">{confirmConfig.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">{confirmConfig.body}</p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="h-11 rounded-xl bg-white/[0.07] text-sm font-medium text-slate-300"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  confirmConfig.onConfirm();
                  setConfirmAction(null);
                }}
                className={`h-11 rounded-xl text-sm font-bold ${
                  confirmConfig.danger ? 'bg-red-500/85 text-white' : 'bg-amber-400 text-slate-950'
                }`}
              >
                {confirmConfig.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function PageHeader({ title, subtitle }) {
  return (
    <header className="pt-2">
      <h1 className="text-2xl font-bold text-white">{title}</h1>
      <p className="mt-1 text-sm leading-5 text-slate-400">{subtitle}</p>
    </header>
  );
}

function EmptyState({ title, text }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/14 bg-white/[0.035] p-5 text-center">
      <p className="text-base font-semibold text-white">{title}</p>
      <p className="mt-1.5 text-sm leading-5 text-slate-400">{text}</p>
    </div>
  );
}

function TagButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-8 rounded-full px-3 text-xs font-medium transition ${
        active ? 'bg-amber-400 text-slate-950' : 'bg-slate-800/80 text-slate-300 active:bg-slate-700'
      }`}
    >
      {children}
    </button>
  );
}

function SmallButton({ children, onClick, danger = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-8 rounded-full px-3 text-xs font-medium ${
        danger ? 'bg-transparent text-red-300 active:bg-red-500/10' : 'bg-slate-800/70 text-slate-300'
      }`}
    >
      {children}
    </button>
  );
}

export default App;
