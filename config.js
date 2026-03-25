const SUPABASE_URL = "https://jezibgdemidhebbcpdch.supabase.co";
const SUPABASE_KEY = "sb_publishable_NDyz8DAcTO8kOs6JhAjTFw_uRTgb5nf";

const SB_HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: "Bearer " + SUPABASE_KEY,
  "Content-Type": "application/json",
  Prefer: "return=representation"
};

const STORAGE_SESSIONS = "gym_sessions_v2";
const VAPID_PUBLIC_KEY = "BAk4jCgjSer-vn0fVooPl7DNzED3Ijsh6qEkHU0t_ZNbeq8sJWkSQUws_vm5KmxvqwG9MjZ-b1L48NMjPjQsuBM";

const STORAGE_WORKOUTS = "gym_workouts_v4";
const STORAGE_SETTINGS = "gym_settings_v1";

const DEFAULT_WORKOUTS = [
  { id: "A", name: "אימון A", exercises: [
    { name: "לחיצת חזה", rest: 90 }, { name: "כתפיים קדמי", rest: 60 },
    { name: "טרייספס", rest: 60 }, { name: "בטן", rest: 45 }
  ]},
  { id: "B", name: "אימון B", exercises: [
    { name: "גב רחב", rest: 90 }, { name: "בייספס", rest: 60 },
    { name: "כתפיים אחורי", rest: 60 }, { name: "ישבן", rest: 90 }
  ]}
];

const DEFAULT_SETTINGS = { weeklyGoal: 4, goalHistory: [] };

const CATEGORIES = [
  { id: "chest",     label: "חזה",      icon: "heart" },
  { id: "back",      label: "גב",       icon: "layers" },
  { id: "shoulders", label: "כתפיים",   icon: "triangle" },
  { id: "arms",      label: "ידיים",    icon: "hand" },
  { id: "legs",      label: "רגליים",   icon: "footprints" },
  { id: "core",      label: "בטן/ליבה", icon: "target" },
  { id: "cardio",    label: "קרדיו",    icon: "activity" }
];

Object.assign(window, {
  SUPABASE_URL,
  SUPABASE_KEY,
  SB_HEADERS,
  STORAGE_SESSIONS,
  VAPID_PUBLIC_KEY,
  STORAGE_WORKOUTS,
  STORAGE_SETTINGS,
  DEFAULT_WORKOUTS,
  DEFAULT_SETTINGS,
  CATEGORIES
});
