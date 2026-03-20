const CACHE_NAME = 'my-app-cache-v1';

// רשימת הקבצים שאנחנו רוצים לשמור בזיכרון במכשיר של המשתמש
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  // אם יש לך קובץ CSS או JS נפרדים, הוסף אותם לכאן:
  // './style.css',
  // './app.js'
];

// התקנת ה-Service Worker ושמירת הקבצים בקאש
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

// "חטיפת" בקשות רשת - קודם כל בודקים אם הקובץ קיים בזיכרון
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // אם מצאנו בזיכרון - נחזיר משם. אחרת, נמשוך מהאינטרנט.
        return response || fetch(event.request);
      })
  );
});
