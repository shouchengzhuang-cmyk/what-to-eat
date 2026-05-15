import { useEffect, useRef, useState } from 'react';
import { defaultBreakfastFoods, defaultFoods, defaultInstantNoodles, tagGroups } from './defaults';

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

function readSavedData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && typeof saved === 'object') return saved;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
  return null;
}

function getInitialFoods() {
  const saved = readSavedData();
  if ((saved?.version === 1 || saved?.version === 2) && Array.isArray(saved.foods)) {
    return normalizeFoods(saved.foods);
  }

  return normalizeFoods(defaultFoods);
}

function getInitialBreakfastFoods() {
  const saved = readSavedData();
  return mergeDefaultPool(defaultBreakfastFoods, saved?.breakfastFoods, normalizePoolFood);
}

function getInitialInstantNoodles() {
  const saved = readSavedData();
  return mergeDefaultPool(defaultInstantNoodles, saved?.instantNoodles, normalizePoolFood);
}

function normalizeFoods(foods) {
  return foods
    .map((food, index) => normalizeFood(food, index))
    .filter(Boolean);
}

function normalizePoolFoods(items) {
  return items
    .map((item, index) => normalizePoolFood(item, index))
    .filter(Boolean);
}

function mergeDefaultPool(defaultItems, savedItems, normalizer) {
  if (!Array.isArray(savedItems)) return normalizePoolFoods(defaultItems);

  const savedById = new Map(savedItems.filter((item) => item?.id).map((item) => [item.id, item]));
  return defaultItems
    .map((item, index) => {
      const saved = savedById.get(item.id);
      return normalizer(
        {
          ...item,
          favorite: saved?.favorite ?? item.favorite,
          enabled: saved?.enabled ?? item.enabled,
          avoidUntil: saved?.avoidUntil ?? item.avoidUntil,
        },
        index,
      );
    })
    .filter(Boolean);
}

function normalizePoolFood(food, index = 0) {
  if (!food || typeof food.name !== 'string') return null;

  const name = food.name.trim();
  if (!name) return null;

  const displayName = typeof food.displayName === 'string' && food.displayName.trim() ? food.displayName.trim() : name;
  const place = typeof food.place === 'string' ? food.place.trim() : '';
  const brand = typeof food.brand === 'string' ? food.brand.trim() : '';

  return {
    ...food,
    id: food.id || `pool-${Date.now()}-${index}`,
    brand,
    name,
    displayName,
    place,
    scene: typeof food.scene === 'string' && food.scene.trim() ? food.scene.trim() : '',
    area: typeof food.area === 'string' && food.area.trim() ? food.area.trim() : '',
    floor: typeof food.floor === 'string' && food.floor.trim() ? food.floor.trim() : '',
    type: Array.isArray(food.type) ? food.type : [],
    tags: Array.isArray(food.tags) ? food.tags : [],
    reason: typeof food.reason === 'string' && food.reason.trim() ? food.reason.trim() : '今天就吃它，简单省心。',
    weight: normalizeWeight(food.weight),
    enabled: food.enabled !== false,
    favorite: Boolean(food.favorite),
    avoidUntil: food.avoidUntil ?? null,
  };
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

function getRecommendationMode(date = new Date()) {
  const totalMinutes = date.getHours() * 60 + date.getMinutes();

  if (totalMinutes >= 6 * 60 && totalMinutes < 9 * 60 + 30) {
    return 'breakfast';
  }

  if (totalMinutes >= 9 * 60 + 30 && totalMinutes < 21 * 60 + 30) {
    return 'meal';
  }

  return 'late-night';
}

function getMealInfoByMode(mode) {
  if (mode === 'breakfast') {
    return { tags: ['早餐'], label: '早餐', hint: '早上先垫一口。' };
  }

  if (mode === 'meal') {
    return { tags: ['正餐'], label: '正餐', hint: '这一顿交给它决定。' };
  }

  return { tags: ['夜宵'], label: '夜宵', hint: '这个点就别太正式了，来点夜宵。' };
}

function App() {
  const [activeTab, setActiveTab] = useState('recommend');
  const [foods, setFoods] = useState(getInitialFoods);
  const [breakfastFoods, setBreakfastFoods] = useState(getInitialBreakfastFoods);
  const [instantNoodles, setInstantNoodles] = useState(getInitialInstantNoodles);
  const [now, setNow] = useState(() => new Date());
  const [selectedScene, setSelectedScene] = useState('');
  const [roundMealInfo, setRoundMealInfo] = useState(null);
  const [isResultMode, setIsResultMode] = useState(false);
  const [currentFood, setCurrentFood] = useState(null);
  const [currentInstantNoodle, setCurrentInstantNoodle] = useState(null);
  const [historyItems, setHistoryItems] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [toast, setToast] = useState({ id: 0, message: '', visible: false });
  const [editingFood, setEditingFood] = useState(null);
  const [settingsMessage, setSettingsMessage] = useState('');

  const recommendationMode = getRecommendationMode(now);
  const isBreakfast = recommendationMode === 'breakfast';
  const isLateNight = recommendationMode === 'late-night';
  const breakfastPool = breakfastFoods.filter((food) => food.enabled);
  const recommendationPool =
    recommendationMode === 'meal' && selectedScene
      ? foods.filter((food) => food.enabled && food.scene === selectedScene && food.tags.includes('正餐') && !food.tags.includes('早餐'))
      : [];
  const activeFoodPool = isBreakfast ? breakfastPool : recommendationPool;
  const instantNoodlePool = instantNoodles.filter((noodle) => noodle.enabled);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 30000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, foods, breakfastFoods, instantNoodles }));
  }, [foods, breakfastFoods, instantNoodles]);

  useEffect(() => {
    if (!currentFood) return;

    if (currentFood.id?.startsWith('breakfast-')) {
      setCurrentFood(breakfastFoods.find((food) => food.id === currentFood.id) || null);
    } else {
      setCurrentFood(foods.find((food) => food.id === currentFood.id) || null);
    }
  }, [foods, breakfastFoods, currentFood]);

  useEffect(() => {
    if (currentInstantNoodle) {
      setCurrentInstantNoodle(instantNoodles.find((noodle) => noodle.id === currentInstantNoodle.id) || null);
    }
  }, [instantNoodles, currentInstantNoodle]);

  useEffect(() => {
    setCurrentFood(null);
    setCurrentInstantNoodle(null);
    setHistoryItems([]);
    setHistoryIndex(-1);
    setRoundMealInfo(null);
    setIsResultMode(false);

    if (recommendationMode !== 'meal') {
      setSelectedScene('');
    }
  }, [recommendationMode]);

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
    setCurrentInstantNoodle(null);
    setIsResultMode(false);
    setHistoryItems([]);
    setHistoryIndex(-1);
    setRoundMealInfo(null);
    clearToast();
  };

  const getActivePool = () => (isLateNight ? instantNoodlePool : activeFoodPool);

  const getCurrentRecommendation = () => currentInstantNoodle || currentFood;

  const showRecommendation = (item) => {
    if (isLateNight) {
      setCurrentInstantNoodle(item || null);
      setCurrentFood(null);
    } else {
      setCurrentFood(item || null);
      setCurrentInstantNoodle(null);
    }
  };

  const pickRandomFromActivePool = (excludedId = getCurrentRecommendation()?.id) => {
    const pool = getActivePool();
    const candidates = pool.length > 1 ? pool.filter((item) => item.id !== excludedId) : pool;
    return weightedRandomPick(candidates);
  };

  const commitRecommendation = (item, { resetHistory = false } = {}) => {
    if (!item) {
      showRecommendation(null);
      setIsResultMode(historyItems.length > 0);
      showToast('没有可推荐的了');
      return;
    }

    showRecommendation(item);
    setIsResultMode(true);
    if (resetHistory) {
      setHistoryItems([item]);
      setHistoryIndex(0);
    } else {
      setHistoryItems((current) => {
        const next = current.slice(0, historyIndex + 1);
        next.push(item);
        setHistoryIndex(next.length - 1);
        return next;
      });
    }
    showToast('');
  };

  const randomRecommend = ({ resetSkipped = false } = {}) => {
    if (!isBreakfast && !selectedScene) {
      showToast('先选到店或宿舍，再随机。');
      return;
    }

    setRoundMealInfo(getMealInfoByMode(recommendationMode));
    commitRecommendation(pickRandomFromActivePool(null), { resetHistory: true });
  };

  const resolveHistoryItem = (item) => {
    if (!item) return null;
    return getActivePool().find((poolItem) => poolItem.id === item.id) || item;
  };

  const goToNextRecommendation = () => {
    if (historyIndex < historyItems.length - 1) {
      const next = resolveHistoryItem(historyItems[historyIndex + 1]);
      setHistoryIndex((current) => current + 1);
      showRecommendation(next);
      return true;
    }

    const next = pickRandomFromActivePool();
    if (!next) return false;
    commitRecommendation(next);
    return true;
  };

  const goToPreviousRecommendation = () => {
    if (historyIndex <= 0) return false;

    const previous = resolveHistoryItem(historyItems[historyIndex - 1]);
    setHistoryIndex((current) => current - 1);
    showRecommendation(previous);
    return true;
  };

  const updateFood = (id, patch) => {
    setFoods((current) => current.map((food) => (food.id === id ? { ...food, ...patch } : food)));
  };

  const updateBreakfastFood = (id, patch) => {
    setBreakfastFoods((current) => current.map((food) => (food.id === id ? { ...food, ...patch } : food)));
  };

  const updateInstantNoodle = (id, patch) => {
    setInstantNoodles((current) => current.map((noodle) => (noodle.id === id ? { ...noodle, ...patch } : noodle)));
  };

  const toggleCurrentFavorite = () => {
    const current = currentInstantNoodle || currentFood;
    if (!current) return;

    const nextFavorite = !current.favorite;
    if (currentInstantNoodle) {
      updateInstantNoodle(currentInstantNoodle.id, { favorite: nextFavorite });
    } else if (isBreakfast) {
      updateBreakfastFood(currentFood.id, { favorite: nextFavorite });
    } else {
      updateFood(currentFood.id, { favorite: nextFavorite });
    }
    showToast(nextFavorite ? '已设为常吃' : '已取消常吃');
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
    const data = JSON.stringify({ version: 2, foods, breakfastFoods, instantNoodles }, null, 2);
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
    setSettingsMessage('已导出');
  };

  const importData = async (file) => {
    if (!file) return;

    try {
      const parsed = JSON.parse(await file.text());
      if (![1, 2].includes(parsed?.version) || !Array.isArray(parsed.foods)) {
        throw new Error('Invalid format');
      }
      setFoods(normalizeFoods(parsed.foods));
      setBreakfastFoods(mergeDefaultPool(defaultBreakfastFoods, parsed.breakfastFoods, normalizePoolFood));
      setInstantNoodles(mergeDefaultPool(defaultInstantNoodles, parsed.instantNoodles, normalizePoolFood));
      setSettingsMessage('已导入');
    } catch {
      setSettingsMessage('导入失败');
    }
  };

  const resetDefault = () => {
    setFoods(normalizeFoods(defaultFoods));
    setBreakfastFoods(normalizePoolFoods(defaultBreakfastFoods));
    setInstantNoodles(normalizePoolFoods(defaultInstantNoodles));
    setCurrentFood(null);
    setCurrentInstantNoodle(null);
    setIsResultMode(false);
    setHistoryItems([]);
    setHistoryIndex(-1);
    setRoundMealInfo(null);
    setSelectedScene('');
    setSettingsMessage('已恢复默认菜单');
  };

  const clearAll = () => {
    setFoods([]);
    setBreakfastFoods([]);
    setInstantNoodles([]);
    setCurrentFood(null);
    setCurrentInstantNoodle(null);
    setIsResultMode(false);
    setSkippedFoodIds([]);
    setSkippedInstantNoodleIds([]);
    setRoundMealInfo(null);
    setSelectedScene('');
    setSettingsMessage('已清空');
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col overflow-x-hidden px-5 pb-24 pt-4">
      <main className="flex-1">
        {activeTab === 'recommend' && (
          <RecommendPage
            recommendationMode={recommendationMode}
            isBreakfast={isBreakfast}
            isLateNight={isLateNight}
            isResultMode={isResultMode}
            currentFood={currentFood}
            currentInstantNoodle={currentInstantNoodle}
            selectedScene={selectedScene}
            candidateCount={activeFoodPool.length}
            instantCandidateCount={instantNoodlePool.length}
            onSelectScene={selectScene}
            mealInfo={roundMealInfo}
            homeMealInfo={getMealInfoByMode(recommendationMode)}
            onRandom={() => randomRecommend({ resetSkipped: true })}
            onRestart={() => randomRecommend({ resetSkipped: true })}
            onBackHome={() => {
              setCurrentFood(null);
              setCurrentInstantNoodle(null);
              setIsResultMode(false);
              setHistoryItems([]);
              setHistoryIndex(-1);
              setRoundMealInfo(null);
              clearToast();
            }}
            canGoPrevious={historyIndex > 0}
            onNext={goToNextRecommendation}
            onPrevious={goToPreviousRecommendation}
            onToggleFavorite={toggleCurrentFavorite}
          />
        )}
        {activeTab === 'library' && (
          <LibraryPage
            foods={foods}
            breakfastFoods={breakfastFoods}
            instantNoodles={instantNoodles}
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
  recommendationMode,
  isBreakfast,
  isLateNight,
  isResultMode,
  currentFood,
  currentInstantNoodle,
  selectedScene,
  candidateCount,
  instantCandidateCount,
  onSelectScene,
  mealInfo,
  homeMealInfo,
  onRandom,
  onRestart,
  onBackHome,
  canGoPrevious,
  onNext,
  onPrevious,
  onToggleFavorite,
}) {
  const touchStartRef = useRef(null);
  const lastTapTimeRef = useRef(0);
  const lastFavoriteToggleAtRef = useRef(0);
  const [swipeDirection, setSwipeDirection] = useState(null);
  const [isSwipingOut, setIsSwipingOut] = useState(false);
  const [isBouncing, setIsBouncing] = useState(false);

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
    if (!start || isSwipingOut || isBouncing) return;

    const touch = event.changedTouches[0];
    const deltaY = touch.clientY - start.y;
    const distanceY = Math.abs(deltaY);
    const distanceX = Math.abs(touch.clientX - start.x);

    if (distanceY > 50 && distanceY > distanceX * 1.25) {
      const nextDirection = deltaY < 0 ? 'up' : 'down';

      if (nextDirection === 'down' && !canGoPrevious) {
        setSwipeDirection('down');
        setIsBouncing(true);
        window.setTimeout(() => {
          setIsBouncing(false);
          setSwipeDirection(null);
        }, 140);
        return;
      }

      setSwipeDirection(nextDirection);
      setIsSwipingOut(true);
      window.setTimeout(() => {
        if (nextDirection === 'up') {
          onNext();
        } else {
          onPrevious();
        }
        setIsSwipingOut(false);
        setSwipeDirection(null);
      }, 150);
      return;
    }

    if (distanceY > 14 || distanceX > 14) return;

    const now = Date.now();
    if (now - lastTapTimeRef.current < 320) {
      toggleFavoriteOnce();
      lastTapTimeRef.current = 0;
    } else {
      lastTapTimeRef.current = now;
    }
  };

  if (!isResultMode) {
    const isSinglePoolMode = isBreakfast || isLateNight;
    const singlePoolCount = isBreakfast ? candidateCount : instantCandidateCount;
    const headerLabel = isBreakfast ? '' : isLateNight ? '泡面夜宵' : '';
    const title = isBreakfast ? '早上好！' : isLateNight ? '夜宵吃什么？' : '今天吃什么？';
    const subtitle = isBreakfast ? '早上先垫一口。' : isLateNight ? '别想了，泡面局。' : '别想了，交给随机。';
    const buttonText = isBreakfast ? '随机一份' : '随机一碗';
    const countText = isLateNight ? `当前泡面可选：${instantCandidateCount} 个` : '';
    const footnote = isLateNight ? '夜宵有且只有泡面。' : '';

    return (
      <section className="flex min-h-[calc(100vh-8rem)] flex-col pb-3">
        <div className="flex flex-1 flex-col justify-center py-6">
          <header className="text-center">
            {headerLabel && <p className="text-sm font-semibold text-amber-200">{headerLabel}</p>}
            <h1 className="mt-2 text-[2.35rem] font-bold leading-tight tracking-normal text-white">
              {title}
            </h1>
            <p className="mt-3 text-sm font-normal text-slate-400">{subtitle}</p>
          </header>

          {isSinglePoolMode ? (
            <>
              {countText && <p className="mt-10 text-center text-sm font-semibold text-slate-400">{countText}</p>}
              <button
                type="button"
                onClick={onRandom}
                disabled={singlePoolCount === 0}
                className={`mx-auto ${countText ? 'mt-4' : 'mt-10'} h-16 w-full max-w-[19rem] rounded-[1.4rem] text-xl font-bold shadow-glow transition active:scale-[0.99] ${
                  singlePoolCount === 0 ? 'cursor-not-allowed bg-slate-700 text-slate-400 shadow-none' : 'bg-amber-400 text-slate-950'
                }`}
              >
                {buttonText}
              </button>
              {footnote && <p className="mt-3 text-center text-xs text-slate-500">{footnote}</p>}
            </>
          ) : (
            <>
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
                  <button
                    type="button"
                    onClick={onRandom}
                    disabled={candidateCount === 0}
                    className={`mx-auto mt-7 h-16 w-full max-w-[19rem] rounded-[1.4rem] text-xl font-bold shadow-glow transition active:scale-[0.99] ${
                      candidateCount === 0 ? 'cursor-not-allowed bg-slate-700 text-slate-400 shadow-none' : 'bg-amber-400 text-slate-950'
                    }`}
                  >
                    随机一下
                  </button>
                </>
              )}
            </>
          )}
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
      {isLateNight ? (
        <InstantNoodleCard
          noodle={currentInstantNoodle}
          swipeDirection={swipeDirection}
          isSwipingOut={isSwipingOut}
          isBouncing={isBouncing}
          onRestart={onRestart}
          onBackHome={onBackHome}
        />
      ) : (
        <ResultCard
          food={currentFood}
          resultContext={isBreakfast ? '早餐' : [selectedScene, mealInfo?.label].filter(Boolean).join(' · ')}
          swipeDirection={swipeDirection}
          isSwipingOut={isSwipingOut}
          isBouncing={isBouncing}
          onRestart={onRestart}
          onBackHome={onBackHome}
        />
      )}
    </section>
  );
}

function getSwipeClass({ swipeDirection, isSwipingOut, isBouncing }) {
  if (isSwipingOut && swipeDirection === 'up') return '-translate-y-1 opacity-0';
  if (isSwipingOut && swipeDirection === 'down') return 'translate-y-1 opacity-0';
  if (isBouncing && swipeDirection === 'down') return 'translate-y-2 opacity-95';
  return 'translate-y-0 scale-100 opacity-100';
}

function InstantNoodleCard({ noodle, swipeDirection, isSwipingOut, isBouncing, onRestart, onBackHome }) {
  if (!noodle) {
    return (
      <div className="flex min-h-[70vh] flex-1 flex-col items-center justify-center rounded-[2rem] border border-dashed border-white/14 bg-white/[0.035] p-6 text-center">
        <p className="text-2xl font-bold text-white">这一轮快被你划完了</p>
        <p className="mt-3 text-sm leading-6 text-slate-400">重新开始，再随机一碗。</p>
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

  const tagItems = (noodle.tags || []).slice(0, 4);

  return (
    <article
      className={`relative flex min-h-[74vh] flex-1 flex-col justify-between rounded-[2rem] border border-amber-300/12 bg-gradient-to-b from-amber-300/[0.13] via-white/[0.035] to-white/[0.02] p-5 shadow-glow transition duration-150 ease-out ${getSwipeClass({
        swipeDirection,
        isSwipingOut,
        isBouncing,
      })}`}
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
          <p className="text-sm font-medium text-amber-200">泡面夜宵</p>
          {noodle.favorite && <span className="rounded-full bg-amber-300/90 px-2.5 py-1 text-xs font-bold text-slate-950">已常吃</span>}
        </div>
      </div>

      <div className="max-w-full py-6">
        <h2 className="max-w-full break-words text-5xl font-bold leading-tight tracking-normal text-white">
          {noodle.displayName || noodle.name}
        </h2>
        <p className="mt-3 max-w-full break-words text-base font-semibold leading-6 text-amber-100/80">{noodle.brand}</p>
        {tagItems.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-1.5">
            {tagItems.map((tag) => (
              <span key={tag} className="rounded-full bg-slate-900/70 px-2.5 py-1 text-xs font-medium text-slate-300">
                {tag}
              </span>
            ))}
          </div>
        )}
        <p className="mt-6 text-lg font-normal leading-8 text-slate-200">{noodle.reason}</p>
      </div>
      <div />
    </article>
  );
}

function ResultCard({ food, resultContext, swipeDirection, isSwipingOut, isBouncing, onRestart, onBackHome }) {
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
      className={`relative flex min-h-[74vh] flex-1 flex-col justify-between rounded-[2rem] border border-amber-300/12 bg-gradient-to-b from-amber-300/[0.13] via-white/[0.035] to-white/[0.02] p-5 shadow-glow transition duration-150 ease-out ${getSwipeClass({
        swipeDirection,
        isSwipingOut,
        isBouncing,
      })}`}
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
      <div />
    </article>
  );
}

function LibraryPage({ foods, breakfastFoods, instantNoodles, editingFood, setEditingFood, onSave, onDelete, onToggleFavorite }) {
  const libraryGroups = [
    {
      id: 'breakfast',
      title: '早餐',
      foods: breakfastFoods,
      readOnly: true,
    },
    {
      id: 'meal-store',
      title: '正餐 · 到店',
      foods: foods.filter((food) => food.scene === '到店' && food.tags.includes('正餐') && !food.tags.includes('早餐')),
    },
    {
      id: 'meal-dorm',
      title: '正餐 · 宿舍',
      foods: foods.filter((food) => food.scene === '宿舍' && food.tags.includes('正餐') && !food.tags.includes('早餐')),
    },
    {
      id: 'late-night',
      title: '夜宵 · 泡面',
      foods: instantNoodles,
      readOnly: true,
      instant: true,
    },
  ];

  return (
    <section className="space-y-3">
      <PageHeader title="菜单库" subtitle="整理那些你真的会吃的选项。" />
      <button
        type="button"
        onClick={() => setEditingFood(emptyFood)}
        className="h-11 rounded-xl bg-amber-400 px-5 text-sm font-bold text-slate-950"
      >
        新增食物
      </button>

      {editingFood && <FoodForm food={editingFood} setFood={setEditingFood} onSave={onSave} onCancel={() => setEditingFood(null)} />}

      <div className="space-y-5">
        {libraryGroups.map((group) => (
          <section key={group.id} className="space-y-2.5">
            <div className="flex items-center justify-between border-b border-white/8 pb-2">
              <h2 className="text-base font-bold text-white">{group.title}</h2>
              <span className="text-xs font-semibold text-slate-500">{group.foods.length}</span>
            </div>
            {group.foods.length === 0 ? (
              <EmptyState title={`暂无${group.title}`} text="可以从上方新增食物。" />
            ) : (
              group.foods.map((food) =>
                group.instant ? (
                  <InstantNoodleListCard key={food.id} noodle={food} />
                ) : (
                  <FoodCard
                    key={food.id}
                    food={food}
                    readOnly={group.readOnly}
                    setEditingFood={setEditingFood}
                    onDelete={onDelete}
                    onToggleFavorite={onToggleFavorite}
                  />
                ),
              )
            )}
          </section>
        ))}
      </div>
    </section>
  );
}

function FoodCard({ food, setEditingFood, onDelete, onToggleFavorite, readOnly = false }) {
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
      {!readOnly && (
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
      )}
    </article>
  );
}

function InstantNoodleListCard({ noodle }) {
  return (
    <article className="rounded-2xl border border-white/8 bg-white/[0.045] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="break-words text-base font-semibold text-white">{noodle.displayName || noodle.name}</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">{noodle.brand}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">{noodle.reason}</p>
        </div>
        {noodle.favorite && <span className="shrink-0 rounded-full bg-amber-300/90 px-2 py-0.5 text-[11px] font-bold text-slate-950">常吃</span>}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {(noodle.tags || []).slice(0, 5).map((tag) => (
          <span key={tag} className="rounded-full bg-slate-800/80 px-2 py-0.5 text-[11px] font-medium text-slate-300">
            {tag}
          </span>
        ))}
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
          body: '会改掉当前菜单。',
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
          <p className="mt-1 text-xs text-slate-500">换设备前，先导出一份。</p>
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
          <p className="mt-1 text-xs text-slate-500">这些操作会改掉当前菜单。</p>
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
