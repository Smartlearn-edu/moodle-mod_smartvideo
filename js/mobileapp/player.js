// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Moodle is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <https://www.gnu.org/licenses/>.

/**
 * Moodle Mobile App (Site Plugins) runtime controller for mod_smartvideo.
 *
 * Provides complete video playback, interactive checkpoint questions, offline
 * download via IndexedDB, background auto-sync, timed clinical callouts,
 * interactive captions, and moving security watermark.
 *
 * @package    mod_smartvideo
 * @copyright  2025 Mohammad Nabil <mohammad@smartlearn.education>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
(function(t) {
    'use strict';

    var DB_NAME = 'mod_smartvideo_offline';
    var DB_VERSION = 1;

    var parseJsonSafe = function(str, fallback) {
        if (!str) {
            return fallback;
        }
        if (typeof str !== 'string') {
            return str;
        }
        try {
            return JSON.parse(str);
        } catch (e) {
            return fallback;
        }
    };

    var formatSeconds = function(total) {
        var s = Math.max(0, Math.floor(Number(total) || 0));
        var hrs = Math.floor(s / 3600);
        var mins = Math.floor((s % 3600) / 60);
        var secs = s % 60;
        var pad = function(n) {
            return n < 10 ? '0' + n : String(n);
        };
        if (hrs > 0) {
            return pad(hrs) + ':' + pad(mins) + ':' + pad(secs);
        }
        return pad(mins) + ':' + pad(secs);
    };

    var formatBytes = function(bytes) {
        var b = Number(bytes) || 0;
        if (b < 1024) {
            return b + ' B';
        }
        var kb = b / 1024;
        if (kb < 1024) {
            return kb.toFixed(1) + ' KB';
        }
        var mb = kb / 1024;
        if (mb < 1024) {
            return mb.toFixed(1) + ' MB';
        }
        var gb = mb / 1024;
        return gb.toFixed(2) + ' GB';
    };

    var mergeIntervals = function(intervals) {
        if (!Array.isArray(intervals) || !intervals.length) {
            return {merged: [], totalSeconds: 0};
        }
        var valid = intervals
            .map(function(pair) {
                return [Math.max(0, Math.floor(Number(pair[0]) || 0)), Math.max(0, Math.floor(Number(pair[1]) || 0))];
            })
            .filter(function(pair) {
                return pair[1] > pair[0];
            })
            .sort(function(a, b) {
                return a[0] - b[0];
            });

        if (!valid.length) {
            return {merged: [], totalSeconds: 0};
        }

        var merged = [valid[0]];
        for (var i = 1; i < valid.length; i++) {
            var last = merged[merged.length - 1];
            var curr = valid[i];
            if (curr[0] <= last[1] + 1) {
                last[1] = Math.max(last[1], curr[1]);
            } else {
                merged.push(curr);
            }
        }

        var totalSeconds = 0;
        for (var j = 0; j < merged.length; j++) {
            totalSeconds += (merged[j][1] - merged[j][0]);
        }
        return {merged: merged, totalSeconds: totalSeconds};
    };

    // =========================================================================
    // IndexedDB Offline Storage Engine
    // =========================================================================

    var openDb = function() {
        return new Promise(function(resolve, reject) {
            if (!window.indexedDB) {
                reject(new Error('IndexedDB not supported'));
                return;
            }
            var req = window.indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = function(e) {
                var db = e.target.result;
                if (!db.objectStoreNames.contains('manifests')) {
                    db.createObjectStore('manifests', {keyPath: 'cmid'});
                }
                if (!db.objectStoreNames.contains('segments')) {
                    db.createObjectStore('segments', {keyPath: 'id'});
                }
                if (!db.objectStoreNames.contains('local_state')) {
                    db.createObjectStore('local_state', {keyPath: 'cmid'});
                }
                if (!db.objectStoreNames.contains('sync_queue')) {
                    db.createObjectStore('sync_queue', {keyPath: 'id', autoIncrement: true});
                }
                if (!db.objectStoreNames.contains('assets')) {
                    db.createObjectStore('assets', {keyPath: 'name'});
                }
            };
            req.onsuccess = function(e) {
                resolve(e.target.result);
            };
            req.onerror = function(e) {
                reject(e.target.error || new Error('IndexedDB open error'));
            };
        });
    };

    var idbGet = function(storeName, key) {
        return openDb().then(function(db) {
            return new Promise(function(resolve, reject) {
                var tx = db.transaction(storeName, 'readonly');
                var store = tx.objectStore(storeName);
                var req = store.get(key);
                req.onsuccess = function(e) {
                    resolve(e.target.result);
                };
                req.onerror = function(e) {
                    reject(e.target.error);
                };
            });
        });
    };

    var idbPut = function(storeName, value) {
        return openDb().then(function(db) {
            return new Promise(function(resolve, reject) {
                var tx = db.transaction(storeName, 'readwrite');
                var store = tx.objectStore(storeName);
                var req = store.put(value);
                req.onsuccess = function(e) {
                    resolve(e.target.result);
                };
                req.onerror = function(e) {
                    reject(e.target.error);
                };
            });
        });
    };

    var idbDelete = function(storeName, key) {
        return openDb().then(function(db) {
            return new Promise(function(resolve, reject) {
                var tx = db.transaction(storeName, 'readwrite');
                var store = tx.objectStore(storeName);
                var req = store.delete(key);
                req.onsuccess = function() {
                    resolve();
                };
                req.onerror = function(e) {
                    reject(e.target.error);
                };
            });
        });
    };

    var idbGetAll = function(storeName) {
        return openDb().then(function(db) {
            return new Promise(function(resolve, reject) {
                var tx = db.transaction(storeName, 'readonly');
                var store = tx.objectStore(storeName);
                var req = store.getAll();
                req.onsuccess = function(e) {
                    resolve(e.target.result || []);
                };
                req.onerror = function(e) {
                    reject(e.target.error);
                };
            });
        });
    };

    var idbDeleteSegmentsForCmid = function(cmid) {
        return openDb().then(function(db) {
            return new Promise(function(resolve, reject) {
                var tx = db.transaction('segments', 'readwrite');
                var store = tx.objectStore('segments');
                var req = store.openCursor();
                req.onsuccess = function(e) {
                    var cursor = e.target.result;
                    if (cursor) {
                        if (cursor.value && Number(cursor.value.cmid) === Number(cmid)) {
                            cursor.delete();
                        }
                        cursor.continue();
                    } else {
                        resolve();
                    }
                };
                req.onerror = function(e) {
                    reject(e.target.error);
                };
            });
        });
    };

    // Hydrate structured lists from scalar JSON otherdata.
    t.questionsList = parseJsonSafe(t.CONTENT_OTHERDATA.questionsjson, []);
    t.chaptersList = parseJsonSafe(t.CONTENT_OTHERDATA.chaptersjson, []);
    t.calloutsList = parseJsonSafe(t.CONTENT_OTHERDATA.calloutsjson, []);
    t.cuesList = parseJsonSafe(t.CONTENT_OTHERDATA.cuesjson, []);
    t.notesList = parseJsonSafe(t.CONTENT_OTHERDATA.notesjson, []);
    t.discussionsList = parseJsonSafe(t.CONTENT_OTHERDATA.discussionsjson, []);
    t.watchedIntervals = parseJsonSafe(t.CONTENT_OTHERDATA.watchedintervals, []);

    t.activeCallout = null;
    t.activeQuestion = null;
    t.dismissedCalloutIds = {};
    t.triggeredQuestionAtSecond = -1;
    t.videoEl = null;
    t.hlsInstance = null;
    t.lastTickSecond = null;
    t.offlineManifest = null;
    t.showQualityPicker = false;
    t.offlineTiers = [];
    t.manifestRawData = parseJsonSafe(t.CONTENT_OTHERDATA.offlinemanifestjson, null);
    if (t.manifestRawData && t.manifestRawData.tiers && t.manifestRawData.tiers.length) {
        t.offlineTiers = t.manifestRawData.tiers;
    }
    t.downloadCancelled = false;

    var callWS = function(wsName, params, isWrite) {
        if (t.CoreSitePluginsProvider && typeof t.CoreSitePluginsProvider.callWS === 'function') {
            return t.CoreSitePluginsProvider.callWS(wsName, params, {getFromCache: false, saveToCache: false});
        }
        if (t.CoreSitesProvider) {
            var site = t.CoreSitesProvider.getCurrentSite();
            if (site) {
                if (isWrite && typeof site.write === 'function') {
                    return site.write(wsName, params);
                }
                if (typeof site.read === 'function') {
                    return site.read(wsName, params, {getFromCache: false, saveToCache: false});
                }
                if (typeof site.write === 'function') {
                    return site.write(wsName, params);
                }
            }
        }
        return Promise.reject(new Error('Web service provider unavailable'));
    };

    var exitNativeFullscreenIfActive = function(video) {
        if (!video) {
            return;
        }
        try {
            if (video.webkitDisplayingFullscreen && typeof video.webkitExitFullscreen === 'function') {
                video.webkitExitFullscreen();
            } else if (document.fullscreenElement && typeof document.exitFullscreen === 'function') {
                document.exitFullscreen();
            }
        } catch (e) {
            // Ignore fullscreen exit errors on restricted WebViews.
        }
    };

    var persistLocalState = function() {
        var cmid = Number(t.CONTENT_OTHERDATA.cmid) || 0;
        if (!cmid) {
            return;
        }
        idbPut('local_state', {
            cmid: cmid,
            currenttime: Number(t.CONTENT_OTHERDATA.currenttime) || 0,
            maxposition: Number(t.CONTENT_OTHERDATA.maxposition) || 0,
            watchedseconds: Number(t.CONTENT_OTHERDATA.watchedseconds) || 0,
            watchedintervals: t.CONTENT_OTHERDATA.watchedintervals || '[]',
            percentcompleted: Number(t.CONTENT_OTHERDATA.percentcompleted) || 0,
            updated_at: Date.now()
        }).catch(function() {});
    };

    var syncProgressToServer = function() {
        var cmid = Number(t.CONTENT_OTHERDATA.cmid) || 0;
        if (!cmid) {
            return;
        }
        var mergedInfo = mergeIntervals(t.watchedIntervals);
        t.watchedIntervals = mergedInfo.merged;
        var watchedSecs = Math.max(Number(t.CONTENT_OTHERDATA.watchedseconds) || 0, mergedInfo.totalSeconds);
        t.CONTENT_OTHERDATA.watchedseconds = watchedSecs;
        t.CONTENT_OTHERDATA.watchedintervals = JSON.stringify(t.watchedIntervals);

        persistLocalState();

        var payload = {
            cmid: cmid,
            currentposition: Math.floor(Number(t.CONTENT_OTHERDATA.currenttime) || 0),
            maxposition: Math.floor(Number(t.CONTENT_OTHERDATA.maxposition) || 0),
            watchedseconds: watchedSecs,
            watchedintervals: t.CONTENT_OTHERDATA.watchedintervals
        };

        if (!navigator.onLine) {
            idbPut('sync_queue', {
                cmid: cmid,
                type: 'progress',
                payload: payload,
                timestamp: Date.now()
            }).catch(function() {});
            return;
        }

        callWS('mod_smartvideo_update_progress', payload).then(function(res) {
            if (res && typeof res.percentcompleted !== 'undefined') {
                t.CONTENT_OTHERDATA.percentcompleted = Number(res.percentcompleted) || 0;
                persistLocalState();
            }
        }).catch(function() {
            idbPut('sync_queue', {
                cmid: cmid,
                type: 'progress',
                payload: payload,
                timestamp: Date.now()
            }).catch(function() {});
        });
    };

    // =========================================================================
    // Background Auto-Sync Engine
    // =========================================================================

    var isSyncing = false;
    var flushSyncQueue = function() {
        if (isSyncing || !navigator.onLine) {
            return Promise.resolve();
        }
        isSyncing = true;
        return idbGetAll('sync_queue').then(function(items) {
            if (!items || !items.length) {
                isSyncing = false;
                return;
            }

            var processItem = function(index) {
                if (index >= items.length) {
                    return Promise.resolve();
                }
                var item = items[index];
                var reqPromise = null;
                if (item.type === 'progress') {
                    reqPromise = callWS('mod_smartvideo_update_progress', item.payload);
                } else if (item.type === 'qattempt') {
                    reqPromise = callWS('mod_smartvideo_submit_question_attempt', {
                        cmid: Number(item.cmid),
                        svquestionid: Number(item.svquestionid),
                        formdata: item.formdata
                    });
                } else if (item.type === 'report') {
                    reqPromise = callWS('mod_smartvideo_save_report', item.payload);
                } else if (item.type === 'note') {
                    reqPromise = callWS('mod_smartvideo_add_note', item.payload);
                } else {
                    reqPromise = Promise.resolve();
                }

                return reqPromise.then(function() {
                    return idbDelete('sync_queue', item.id);
                }).catch(function() {
                    return Promise.reject(new Error('Sync failed'));
                }).then(function() {
                    return processItem(index + 1);
                });
            };

            return processItem(0);
        }).finally(function() {
            isSyncing = false;
        });
    };

    window.addEventListener('online', function() {
        t.CONTENT_OTHERDATA.isofflinemode = 0;
        flushSyncQueue();
    });

    window.addEventListener('offline', function() {
        t.CONTENT_OTHERDATA.isofflinemode = 1;
    });

    // =========================================================================
    // Bundled Local HLS.js Loader (Zero External CDN)
    // =========================================================================

    var executeHlsBundle = function(code, resolve) {
        if (!code) {
            resolve(window.Hls || null);
            return;
        }
        try {
            var exportsObj = {};
            var moduleObj = {exports: exportsObj};
            // eslint-disable-next-line no-new-func
            var fn = new Function('module', 'exports', 'define', code);
            fn(moduleObj, exportsObj, undefined);
            var exported = moduleObj.exports && (moduleObj.exports.default || moduleObj.exports);
            if (exported && typeof exported.isSupported === 'function') {
                window.Hls = exported;
                resolve(exported);
                return;
            }
        } catch (e) {}

        if (window.Hls) {
            resolve(window.Hls);
            return;
        }

        var blob = new Blob([code], {type: 'application/javascript'});
        var blobUrl = URL.createObjectURL(blob);
        var script = document.createElement('script');
        script.src = blobUrl;
        script.onload = function() {
            URL.revokeObjectURL(blobUrl);
            if (!window.Hls && typeof window.require === 'function') {
                try {
                    window.require(['local_securevideolibrary/hls-lazy'], function(mod) {
                        window.Hls = mod || window.Hls;
                        resolve(window.Hls || null);
                    });
                    return;
                } catch (e) {}
            }
            resolve(window.Hls || null);
        };
        script.onerror = function() {
            URL.revokeObjectURL(blobUrl);
            resolve(window.Hls || null);
        };
        document.head.appendChild(script);
    };

    var loadHlsLibrary = function() {
        return new Promise(function(resolve) {
            if (window.Hls) {
                resolve(window.Hls);
                return;
            }

            idbGet('assets', 'hls_bundle').then(function(asset) {
                if (asset && asset.code) {
                    executeHlsBundle(asset.code, resolve);
                    return;
                }

                var hlsUrl = t.CONTENT_OTHERDATA.hlsjsurl;
                if (!hlsUrl) {
                    resolve(null);
                    return;
                }

                fetch(hlsUrl).then(function(response) {
                    if (!response.ok) {
                        throw new Error('Failed to fetch bundled HLS library');
                    }
                    return response.text();
                }).then(function(code) {
                    idbPut('assets', {
                        name: 'hls_bundle',
                        code: code,
                        cached_at: Date.now()
                    }).catch(function() {});

                    executeHlsBundle(code, resolve);
                }).catch(function() {
                    resolve(null);
                });
            }).catch(function() {
                resolve(null);
            });
        });
    };

    // =========================================================================
    // Custom Offline IndexedDB Fragment & Key Loader for HLS.js (v1.5.17 Schema)
    // =========================================================================

    function OfflineIdbLoader(config) {
        this.config = config;
        this.context = null;
        this.callbacks = null;
        this.stats = {
            aborted: false,
            loaded: 0,
            retry: 0,
            total: 0,
            chunkCount: 0,
            bwEstimate: 0,
            loading: {start: 0, first: 0, end: 0},
            parsing: {start: 0, end: 0},
            buffering: {start: 0, first: 0, end: 0}
        };
        this.destroy = function() {
            this.callbacks = null;
            this.context = null;
        };
        this.abort = function() {
            this.stats.aborted = true;
            if (this.xhr) {
                try {
                    this.xhr.abort();
                } catch (e) {}
            }
            if (this.callbacks && this.callbacks.onAbort) {
                this.callbacks.onAbort(this.stats, this.context, this.xhr || null);
            }
        };
        this.load = function(context, cfg, callbacks) {
            var self = this;
            this.context = context;
            this.callbacks = callbacks;
            var url = context.url || '';
            var now = performance.now();
            this.stats.loading.start = now;
            this.stats.loading.first = now;

            // 1. Intercept offline playlist manifest in memory (auto-normalizes IV=0x prefix)
            if (url === 'offline://playlist.m3u8' || url.indexOf('offline://playlist.m3u8') !== -1) {
                if (t.offlineManifest && t.offlineManifest.playlisttext) {
                    var plText = t.offlineManifest.playlisttext.replace(/,IV=(?!0x|0X)([0-9a-fA-F]+)/g, ',IV=0x$1');
                    self.stats.loaded = plText.length;
                    self.stats.total = plText.length;
                    self.stats.loading.end = performance.now() + 1;
                    self.stats.bwEstimate = 8000000;
                    setTimeout(function() {
                        if (!self.stats.aborted && self.callbacks) {
                            self.callbacks.onSuccess({url: url, data: plText, code: 200}, self.stats, context, null);
                        }
                    }, 0);
                    return;
                }
            }

            // 2. Intercept offline decryption key
            if (url === 'offline://key' || url.indexOf('offline://key') !== -1) {
                if (t.offlineManifest && t.offlineManifest.keybase64) {
                    var rawKey = atob(t.offlineManifest.keybase64);
                    var keyBytes = new Uint8Array(rawKey.length);
                    for (var k = 0; k < rawKey.length; k++) {
                        keyBytes[k] = rawKey.charCodeAt(k);
                    }
                    self.stats.loaded = keyBytes.byteLength;
                    self.stats.total = keyBytes.byteLength;
                    self.stats.loading.end = performance.now() + 1;
                    self.stats.bwEstimate = 8000000;
                    setTimeout(function() {
                        if (!self.stats.aborted && self.callbacks) {
                            self.callbacks.onSuccess({url: url, data: keyBytes.buffer, code: 200}, self.stats, context, null);
                        }
                    }, 0);
                    return;
                }
            }

            // 3. Intercept offline video segments from IndexedDB
            if (url.indexOf('offline://') === 0) {
                var segFilename = url.substring('offline://'.length).split('?')[0];
                var segId = Number(t.CONTENT_OTHERDATA.cmid) + ':' + segFilename;
                idbGet('segments', segId).then(function(record) {
                    if (self.stats.aborted || !self.callbacks) {
                        return;
                    }
                    if (record && record.data) {
                        self.stats.loaded = record.data.byteLength;
                        self.stats.total = record.data.byteLength;
                        self.stats.loading.end = performance.now() + 1;
                        self.stats.bwEstimate = 8000000;
                        if (self.callbacks.onProgress) {
                            self.callbacks.onProgress(self.stats, context, record.data, null);
                        }
                        self.callbacks.onSuccess({url: url, data: record.data, code: 200}, self.stats, context, null);
                    } else {
                        self.callbacks.onError(
                            {code: 404, text: 'Segment not found in offline DB: ' + segFilename},
                            context,
                            null,
                            self.stats
                        );
                    }
                }).catch(function(err) {
                    if (!self.stats.aborted && self.callbacks) {
                        self.callbacks.onError(
                            {code: 500, text: 'IndexedDB read error: ' + (err ? err.message : '')},
                            context,
                            null,
                            self.stats
                        );
                    }
                });
                return;
            }

            // 4. Fallback for standard network requests
            var xhr = new XMLHttpRequest();
            this.xhr = xhr;
            xhr.open('GET', url, true);
            if (context.responseType) {
                xhr.responseType = context.responseType;
            }
            if (url && url.indexOf('key.php') !== -1) {
                var match = /[?&]token=([a-fA-F0-9]+)/.exec(url);
                if (match && match[1]) {
                    xhr.setRequestHeader('X-Moodle-Player-Token', match[1]);
                }
            }
            xhr.onload = function() {
                if (self.stats.aborted || !self.callbacks) {
                    return;
                }
                if (xhr.status >= 200 && xhr.status < 300) {
                    var respData = (context.responseType && context.responseType !== 'text')
                        ? xhr.response
                        : xhr.responseText;
                    var len = (respData && respData.byteLength)
                        ? respData.byteLength
                        : (respData ? respData.length : 0);
                    self.stats.loaded = len;
                    self.stats.total = len;
                    self.stats.loading.end = performance.now() + 1;
                    self.stats.bwEstimate = 8000000;
                    if (self.callbacks.onProgress) {
                        self.callbacks.onProgress(self.stats, context, respData, xhr);
                    }
                    self.callbacks.onSuccess({url: xhr.responseURL || url, data: respData, code: xhr.status}, self.stats, context, xhr);
                } else {
                    self.callbacks.onError({code: xhr.status, text: xhr.statusText}, context, xhr, self.stats);
                }
            };
            xhr.onerror = function() {
                if (!self.stats.aborted && self.callbacks) {
                    self.callbacks.onError({code: 0, text: 'Network request failed'}, context, xhr, self.stats);
                }
            };
            xhr.send();
        };
    }

    // =========================================================================
    // Quality Selection & Chunked Offline Download Pipeline
    // =========================================================================

    t.openQualityPicker = function() {
        if (t.offlineTiers && t.offlineTiers.length) {
            t.showQualityPicker = true;
            return;
        }
        if (!t.manifestRawData && t.CONTENT_OTHERDATA.offlinemanifestjson) {
            t.manifestRawData = parseJsonSafe(t.CONTENT_OTHERDATA.offlinemanifestjson, null);
            if (t.manifestRawData && t.manifestRawData.tiers && t.manifestRawData.tiers.length) {
                t.offlineTiers = t.manifestRawData.tiers;
                t.showQualityPicker = true;
                return;
            }
        }
        callWS('mod_smartvideo_get_offline_manifest', {
            cmid: Number(t.CONTENT_OTHERDATA.cmid)
        }, false).then(function(res) {
            if (res && res.status && res.tiers && res.tiers.length) {
                t.manifestRawData = res;
                t.offlineTiers = res.tiers;
                t.showQualityPicker = true;
            } else {
                alert(res && res.errormessage
                    ? res.errormessage
                    : 'Unable to fetch video manifest for offline download.');
            }
        }).catch(function(err) {
            var detail = '';
            if (err) {
                detail = err.message || err.error || err.warningmessage || (typeof err === 'string' ? err : '');
            }
            alert('Cannot fetch download options: ' + (detail || 'Please check your connection or server configuration.'));
        });
    };

    t.closeQualityPicker = function() {
        t.showQualityPicker = false;
    };

    t.cancelOfflineDownload = function() {
        t.downloadCancelled = true;
        t.CONTENT_OTHERDATA.isdownloading = 0;
        t.CONTENT_OTHERDATA.downloadpercent = 0;
    };

    t.startOfflineDownload = function(tier) {
        if (!tier || !tier.segments || !tier.segments.length) {
            return;
        }
        t.showQualityPicker = false;
        t.downloadCancelled = false;
        t.CONTENT_OTHERDATA.isdownloading = 1;
        t.CONTENT_OTHERDATA.downloadpercent = 0;
        t.CONTENT_OTHERDATA.downloadtransferred = '0 MB';
        t.CONTENT_OTHERDATA.downloadtotal = tier.totalsize || formatBytes(tier.totalbytes);

        var cmid = Number(t.CONTENT_OTHERDATA.cmid);
        var manifest = t.manifestRawData;
        var segments = tier.segments.slice();
        var totalBytes = Number(tier.totalbytes) || 1;
        var transferredBytes = 0;
        var concurrency = 2;

        var downloadNext = function(index) {
            if (t.downloadCancelled) {
                return Promise.reject(new Error('Download cancelled'));
            }
            if (index >= segments.length) {
                return Promise.resolve();
            }
            var seg = segments[index];
            return fetch(seg.url).then(function(res) {
                if (!res.ok) {
                    throw new Error('Failed to download segment ' + seg.filename);
                }
                return res.arrayBuffer();
            }).then(function(buf) {
                if (t.downloadCancelled) {
                    throw new Error('Download cancelled');
                }
                var segRecord = {
                    id: cmid + ':' + seg.filename,
                    cmid: cmid,
                    filename: seg.filename,
                    data: buf,
                    size: buf.byteLength
                };
                transferredBytes += buf.byteLength;
                t.CONTENT_OTHERDATA.downloadtransferred = formatBytes(transferredBytes);
                t.CONTENT_OTHERDATA.downloadpercent = Math.min(99, Math.floor((transferredBytes / totalBytes) * 100));

                return idbPut('segments', segRecord);
            }).then(function() {
                return downloadNext(index + concurrency);
            });
        };

        var workers = [];
        for (var w = 0; w < concurrency; w++) {
            workers.push(downloadNext(w));
        }

        Promise.all(workers).then(function() {
            if (t.downloadCancelled) {
                return;
            }
            var manifestEntry = {
                cmid: cmid,
                quality: tier.label,
                resolution: tier.resolution,
                totalbytes: tier.totalbytes,
                totalsize: tier.totalsize,
                playlisttext: tier.playlisttext,
                keybase64: manifest.keybase64,
                ivhex: manifest.ivhex,
                sitesalt: manifest.sitesalt || '',
                title: manifest.title || t.CONTENT_OTHERDATA.title,
                duration: manifest.duration,
                questions: manifest.questions || [],
                chapters: manifest.chapters || [],
                callouts: manifest.callouts || [],
                cues: manifest.cues || [],
                downloaded_at: Date.now()
            };

            return idbPut('manifests', manifestEntry).then(function() {
                t.offlineManifest = manifestEntry;
                t.CONTENT_OTHERDATA.isdownloading = 0;
                t.CONTENT_OTHERDATA.offlinedownloaded = 1;
                t.CONTENT_OTHERDATA.offlinequality = tier.label;
                t.CONTENT_OTHERDATA.offlinesizehuman = tier.totalsize;
                t.CONTENT_OTHERDATA.downloadpercent = 100;
                if (t.videoEl && (!t.hlsInstance || (t.videoEl.paused && t.videoEl.currentTime === 0))) {
                    initVideoPlayer();
                }
            });
        }).catch(function(err) {
            if (!t.downloadCancelled) {
                t.CONTENT_OTHERDATA.isdownloading = 0;
                alert('Download encountered an issue: ' + (err ? err.message : 'network error'));
            }
        });
    };

    t.confirmDeleteOffline = function() {
        if (!confirm('Are you sure you want to remove this offline video from your device?')) {
            return;
        }
        var cmid = Number(t.CONTENT_OTHERDATA.cmid);
        idbDeleteSegmentsForCmid(cmid).then(function() {
            return idbDelete('manifests', cmid);
        }).then(function() {
            t.offlineManifest = null;
            t.CONTENT_OTHERDATA.offlinedownloaded = 0;
            t.CONTENT_OTHERDATA.offlinequality = '';
            t.CONTENT_OTHERDATA.offlinesizehuman = '';
            t.CONTENT_OTHERDATA.isofflinemode = 0;
            if (t.videoEl) {
                initVideoPlayer();
            }
        }).catch(function(e) {
            alert('Could not delete offline video: ' + (e ? e.message : ''));
        });
    };

    // =========================================================================
    // Interactive Question Parser & Offline Salted Evaluation
    // =========================================================================

    var parseQuestionHtml = function(attemptData) {
        if (!attemptData || !attemptData.html) {
            return null;
        }
        var parser = new DOMParser();
        var doc = parser.parseFromString(attemptData.html, 'text/html');

        var qtextEl = doc.querySelector('.qtext');
        var promptHtml = qtextEl ? qtextEl.innerHTML : '';

        var hiddenInputs = {};
        var hiddenEls = doc.querySelectorAll('input[type="hidden"]');
        for (var h = 0; h < hiddenEls.length; h++) {
            var el = hiddenEls[h];
            if (el.name) {
                hiddenInputs[el.name] = el.value;
            }
        }

        var choices = [];
        var inputEls = doc.querySelectorAll('.answer input[type="radio"], .answer input[type="checkbox"]');
        for (var i = 0; i < inputEls.length; i++) {
            var inp = inputEls[i];
            var labelEl = doc.querySelector('label[for="' + inp.id + '"]');
            var labelHtml = labelEl ? labelEl.innerHTML : (inp.parentElement ? inp.parentElement.innerHTML : '');
            choices.push({
                id: inp.id || 'choice_' + i,
                name: inp.name,
                value: inp.value,
                type: inp.type.toLowerCase(),
                selected: Boolean(inp.checked),
                labelHtml: labelHtml.trim() || inp.value
            });
        }

        var isTextInput = false;
        var textInputName = '';
        var textValue = '';
        if (!choices.length) {
            var txtInp = doc.querySelector('.answer input[type="text"], .answer textarea, .answer select');
            if (txtInp && txtInp.name) {
                isTextInput = true;
                textInputName = txtInp.name;
                textValue = txtInp.value || '';
            }
        }

        return {
            svquestionid: Number(attemptData.svquestionid),
            title: attemptData.title || '',
            timecode: Number(attemptData.timecode) || 0,
            timeformatted: formatSeconds(attemptData.timecode || 0),
            requirecorrect: Number(attemptData.requirecorrect) || 0,
            rewindonfail: Number(attemptData.rewindonfail) || 0,
            rewindto: typeof attemptData.rewindto !== 'undefined' ? Number(attemptData.rewindto) : -1,
            correcthashes: attemptData.correcthashes || '[]',
            promptHtml: promptHtml,
            hiddenInputs: hiddenInputs,
            choices: choices,
            isTextInput: isTextInput,
            textInputName: textInputName,
            textValue: textValue
        };
    };

    var sha256Hex = function(str) {
        if (window.crypto && window.crypto.subtle && window.TextEncoder) {
            var data = new TextEncoder().encode(str);
            return window.crypto.subtle.digest('SHA-256', data).then(function(buf) {
                var bytes = new Uint8Array(buf);
                var hex = '';
                for (var i = 0; i < bytes.length; i++) {
                    var h = bytes[i].toString(16);
                    hex += (h.length === 1 ? '0' : '') + h;
                }
                return hex;
            });
        }
        return Promise.resolve('');
    };

    var evaluateQuestionOffline = function(activeQ) {
        var salt = (t.offlineManifest && t.offlineManifest.sitesalt) ? t.offlineManifest.sitesalt : '';
        var hashes = [];
        try {
            hashes = JSON.parse(activeQ.correcthashes || '[]');
        } catch (e) {
            hashes = [];
        }

        var submittedValues = [];
        if (activeQ.choices && activeQ.choices.length) {
            activeQ.choices.forEach(function(ch) {
                if (ch.selected) {
                    submittedValues.push(ch.value);
                }
            });
        } else if (activeQ.isTextInput) {
            submittedValues.push((activeQ.textValue || '').trim());
        }

        if (!submittedValues.length) {
            return Promise.resolve({
                is_correct: false,
                can_continue: false,
                feedback: 'Please select or enter an answer.'
            });
        }

        var checkPromises = submittedValues.map(function(val) {
            return sha256Hex(activeQ.svquestionid + ':' + val + ':' + salt);
        });

        return Promise.all(checkPromises).then(function(calculatedHashes) {
            var isCorrect = calculatedHashes.some(function(h) {
                return hashes.indexOf(h) !== -1;
            });

            var canContinue = Boolean(isCorrect || !activeQ.requirecorrect);
            return {
                is_correct: isCorrect,
                can_continue: canContinue,
                rewind_to: (!isCorrect && activeQ.rewindonfail && activeQ.rewindto >= 0) ? activeQ.rewindto : -1,
                feedback: isCorrect
                    ? '<p style="color: var(--ion-color-success);">Correct answer!</p>'
                    : '<p style="color: var(--ion-color-danger);">Incorrect. Please review and try again.</p>'
            };
        });
    };

    var triggerQuestionAttempt = function(qItem, forceNew) {
        if (t.videoEl && !t.videoEl.paused) {
            t.videoEl.pause();
        }
        exitNativeFullscreenIfActive(t.videoEl);

        t.CONTENT_OTHERDATA.questionfeedbackhtml = '';
        t.CONTENT_OTHERDATA.questioncancontinue = 0;
        t.CONTENT_OTHERDATA.questioniscorrect = 0;
        t.CONTENT_OTHERDATA.questionsubmitting = 0;

        // Offline check: fallback to pre-cached offline question manifest
        if (!navigator.onLine || t.CONTENT_OTHERDATA.isofflinemode) {
            if (t.offlineManifest && t.offlineManifest.questions) {
                var qList = t.offlineManifest.questions;
                for (var i = 0; i < qList.length; i++) {
                    if (Number(qList[i].svquestionid) === Number(qItem.id || qItem.svquestionid)) {
                        t.activeQuestion = parseQuestionHtml(qList[i]);
                        if (qList[i].passed) {
                            t.CONTENT_OTHERDATA.questioniscorrect = 1;
                            t.CONTENT_OTHERDATA.questioncancontinue = 1;
                        }
                        return;
                    }
                }
            }
        }

        callWS('mod_smartvideo_get_question_attempt', {
            cmid: Number(t.CONTENT_OTHERDATA.cmid),
            svquestionid: Number(qItem.id || qItem.svquestionid),
            forcenew: Boolean(forceNew)
        }).then(function(res) {
            if (!res) {
                return;
            }
            t.activeQuestion = parseQuestionHtml(res);
            if (res.passed) {
                t.CONTENT_OTHERDATA.questioniscorrect = 1;
                t.CONTENT_OTHERDATA.questioncancontinue = 1;
            }
        }).catch(function() {
            // Offline fallback if network error occurs
            if (t.offlineManifest && t.offlineManifest.questions) {
                var cachedList = t.offlineManifest.questions;
                for (var j = 0; j < cachedList.length; j++) {
                    if (Number(cachedList[j].svquestionid) === Number(qItem.id || qItem.svquestionid)) {
                        t.activeQuestion = parseQuestionHtml(cachedList[j]);
                        return;
                    }
                }
            }
        });
    };

    t.selectQuestionChoice = function(choice) {
        if (!t.activeQuestion || !t.activeQuestion.choices) {
            return;
        }
        if (choice.type === 'radio') {
            for (var i = 0; i < t.activeQuestion.choices.length; i++) {
                t.activeQuestion.choices[i].selected = (t.activeQuestion.choices[i] === choice);
            }
        } else {
            choice.selected = !choice.selected;
        }
    };

    t.submitActiveQuestion = function() {
        if (!t.activeQuestion || t.CONTENT_OTHERDATA.questionsubmitting) {
            return;
        }
        var payload = {};
        var hidden = t.activeQuestion.hiddenInputs || {};
        Object.keys(hidden).forEach(function(k) {
            payload[k] = hidden[k];
        });

        if (t.activeQuestion.choices && t.activeQuestion.choices.length) {
            for (var i = 0; i < t.activeQuestion.choices.length; i++) {
                var ch = t.activeQuestion.choices[i];
                if (ch.selected) {
                    payload[ch.name] = ch.value;
                }
            }
        } else if (t.activeQuestion.isTextInput && t.activeQuestion.textInputName) {
            payload[t.activeQuestion.textInputName] = t.activeQuestion.textValue || '';
        }

        var cmid = Number(t.CONTENT_OTHERDATA.cmid);
        var qid = Number(t.activeQuestion.svquestionid);
        t.CONTENT_OTHERDATA.questionsubmitting = 1;

        var handleOfflineEvaluation = function() {
            evaluateQuestionOffline(t.activeQuestion).then(function(evalResult) {
                t.CONTENT_OTHERDATA.questionsubmitting = 0;
                t.CONTENT_OTHERDATA.questioniscorrect = evalResult.is_correct ? 1 : 0;
                t.CONTENT_OTHERDATA.questioncancontinue = evalResult.can_continue ? 1 : 0;
                t.CONTENT_OTHERDATA.questionfeedbackhtml = evalResult.feedback;

                if (evalResult.is_correct) {
                    for (var idx = 0; idx < t.questionsList.length; idx++) {
                        if (Number(t.questionsList[idx].id) === qid) {
                            t.questionsList[idx].passed = true;
                        }
                    }
                } else if (evalResult.rewind_to >= 0 && !evalResult.can_continue) {
                    if (t.videoEl) {
                        t.videoEl.currentTime = evalResult.rewind_to;
                    }
                }

                idbPut('sync_queue', {
                    cmid: cmid,
                    type: 'qattempt',
                    svquestionid: qid,
                    formdata: JSON.stringify(payload),
                    timestamp: Date.now()
                }).catch(function() {});
            });
        };

        if (!navigator.onLine || t.CONTENT_OTHERDATA.isofflinemode) {
            handleOfflineEvaluation();
            return;
        }

        callWS('mod_smartvideo_submit_question_attempt', {
            cmid: cmid,
            svquestionid: qid,
            formdata: JSON.stringify(payload)
        }).then(function(res) {
            t.CONTENT_OTHERDATA.questionsubmitting = 0;
            if (!res) {
                return;
            }
            t.CONTENT_OTHERDATA.questioniscorrect = res.is_correct ? 1 : 0;
            t.CONTENT_OTHERDATA.questioncancontinue = res.can_continue ? 1 : 0;
            t.CONTENT_OTHERDATA.questionfeedbackhtml = res.feedback_html || ' ';

            if (res.passed) {
                for (var idx = 0; idx < t.questionsList.length; idx++) {
                    if (Number(t.questionsList[idx].id) === qid) {
                        t.questionsList[idx].passed = true;
                    }
                }
            } else if (typeof res.rewind_to === 'number' && res.rewind_to >= 0 && !res.can_continue) {
                if (t.videoEl) {
                    t.videoEl.currentTime = res.rewind_to;
                }
            }
        }).catch(function() {
            handleOfflineEvaluation();
        });
    };

    t.retryActiveQuestion = function() {
        if (!t.activeQuestion) {
            return;
        }
        triggerQuestionAttempt({id: t.activeQuestion.svquestionid}, true);
    };

    t.continueAfterQuestion = function() {
        t.activeQuestion = null;
        t.CONTENT_OTHERDATA.questionfeedbackhtml = '';
        t.CONTENT_OTHERDATA.questioncancontinue = 0;
        if (t.videoEl) {
            t.videoEl.play().catch(function() {});
        }
    };

    t.openQuestionFromList = function(q) {
        t.seekToSeconds(q.timecode);
        triggerQuestionAttempt(q, false);
    };

    t.togglePlay = function() {
        if (!t.videoEl) {
            return;
        }
        if (t.activeQuestion && !t.CONTENT_OTHERDATA.questioncancontinue) {
            return;
        }
        if (t.videoEl.paused) {
            t.videoEl.play().catch(function() {});
        } else {
            t.videoEl.pause();
        }
    };

    t.toggleMute = function() {
        if (!t.videoEl) {
            return;
        }
        t.videoEl.muted = !t.videoEl.muted;
        t.CONTENT_OTHERDATA.ismuted = t.videoEl.muted ? 1 : 0;
    };

    t.toggleCaptions = function() {
        t.CONTENT_OTHERDATA.captionsenabled = t.CONTENT_OTHERDATA.captionsenabled ? 0 : 1;
    };

    t.cyclePlaybackSpeed = function() {
        var rates = [1, 1.25, 1.5, 1.75, 2, 0.75];
        var current = Number(t.CONTENT_OTHERDATA.playbackrate) || 1;
        var nextIdx = (rates.indexOf(current) + 1) % rates.length;
        var nextRate = rates[nextIdx];
        t.CONTENT_OTHERDATA.playbackrate = String(nextRate);
        if (t.videoEl) {
            t.videoEl.playbackRate = nextRate;
        }
    };

    t.toggleFullscreen = function() {
        var stage = document.getElementById('smartVideoMobileStage');
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(function() {});
            return;
        }
        if (stage && typeof stage.requestFullscreen === 'function') {
            stage.requestFullscreen().catch(function() {});
        } else if (t.videoEl && typeof t.videoEl.webkitEnterFullscreen === 'function') {
            t.videoEl.webkitEnterFullscreen();
        }
    };

    t.resumePlayback = function() {
        t.CONTENT_OTHERDATA.showresumetoast = 0;
        if (t.videoEl) {
            t.videoEl.currentTime = Number(t.CONTENT_OTHERDATA.lastposition) || 0;
            t.videoEl.play().catch(function() {});
        }
    };

    t.startOverPlayback = function() {
        t.CONTENT_OTHERDATA.showresumetoast = 0;
        if (t.videoEl) {
            t.videoEl.currentTime = 0;
            t.videoEl.play().catch(function() {});
        }
    };

    t.dismissCallout = function() {
        if (t.activeCallout) {
            t.dismissedCalloutIds[t.activeCallout.id] = true;
            t.activeCallout = null;
        }
    };

    t.seekToSeconds = function(targetSec) {
        if (!t.videoEl) {
            return;
        }
        var desired = Math.max(0, Number(targetSec) || 0);
        if (t.CONTENT_OTHERDATA.preventseeking) {
            var maxAllowed = Number(t.CONTENT_OTHERDATA.maxposition) || 0;
            if (desired > maxAllowed + 2) {
                desired = maxAllowed;
            }
        }
        t.videoEl.currentTime = desired;
    };

    t.onSeekBarTap = function(ev) {
        if (!t.videoEl || !ev || !ev.currentTarget) {
            return;
        }
        var rect = ev.currentTarget.getBoundingClientRect();
        if (!rect.width) {
            return;
        }
        var ratio = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
        var dur = Number(t.CONTENT_OTHERDATA.duration) || t.videoEl.duration || 0;
        if (dur > 0) {
            t.seekToSeconds(ratio * dur);
        }
    };

    // =========================================================================
    // Student Personal Notes
    // =========================================================================

    t.addNote = function() {
        var content = (t.CONTENT_OTHERDATA.newnotecontent || '').trim();
        if (!content) {
            return;
        }
        var curSec = Math.floor(t.videoEl ? t.videoEl.currentTime : Number(t.CONTENT_OTHERDATA.currenttime) || 0);
        var cmid = Number(t.CONTENT_OTHERDATA.cmid);

        callWS('mod_smartvideo_add_note', {
            cmid: cmid,
            timecode: curSec,
            content: content
        }).then(function(res) {
            if (res && res.status) {
                t.CONTENT_OTHERDATA.newnotecontent = '';
                t.notesList.push({
                    id: Number(res.noteid),
                    timecode: curSec,
                    timeformatted: formatSeconds(curSec),
                    content: content,
                    rawcontent: content,
                    timemodified: Math.floor(Date.now() / 1000)
                });
                t.notesList.sort(function(a, b) {
                    return a.timecode - b.timecode;
                });
            }
        }).catch(function() {
            // Offline queue fallback
            t.CONTENT_OTHERDATA.newnotecontent = '';
            var tempId = -Math.floor(Date.now());
            t.notesList.push({
                id: tempId,
                timecode: curSec,
                timeformatted: formatSeconds(curSec),
                content: content,
                rawcontent: content,
                timemodified: Math.floor(Date.now() / 1000)
            });
            idbPut('sync_queue', {
                cmid: cmid,
                type: 'note',
                payload: {
                    cmid: cmid,
                    timecode: curSec,
                    content: content
                },
                timestamp: Date.now()
            }).catch(function() {});
        });
    };

    t.deleteNote = function(noteId) {
        callWS('mod_smartvideo_delete_note', {
            cmid: Number(t.CONTENT_OTHERDATA.cmid),
            noteid: Number(noteId)
        }).then(function(res) {
            if (res && res.status) {
                t.notesList = t.notesList.filter(function(n) {
                    return n.id !== noteId;
                });
            }
        }).catch(function() {});
    };

    // =========================================================================
    // Student Structured Clinical / Case Report
    // =========================================================================

    t.citeCurrentTimeInReport = function(field) {
        var curSec = Math.floor(t.videoEl ? t.videoEl.currentTime : Number(t.CONTENT_OTHERDATA.currenttime) || 0);
        var stamp = '[' + formatSeconds(curSec) + '] ';
        var curVal = t.CONTENT_OTHERDATA['report' + field] || '';
        t.CONTENT_OTHERDATA['report' + field] = curVal ? (curVal + ' ' + stamp) : stamp;
    };

    t.saveMedicalReport = function(isFinalSubmit) {
        t.CONTENT_OTHERDATA.reportsaving = 1;
        var cmid = Number(t.CONTENT_OTHERDATA.cmid);
        var payload = {
            cmid: cmid,
            findings: t.CONTENT_OTHERDATA.reportfindings || '',
            impression: t.CONTENT_OTHERDATA.reportimpression || '',
            diagnosis: t.CONTENT_OTHERDATA.reportdiagnosis || '',
            recommendations: t.CONTENT_OTHERDATA.reportrecommendations || '',
            submit: Boolean(isFinalSubmit)
        };

        callWS('mod_smartvideo_save_report', payload).then(function(res) {
            t.CONTENT_OTHERDATA.reportsaving = 0;
            if (res && res.status) {
                t.CONTENT_OTHERDATA.reportstatus = res.newstatus;
                t.CONTENT_OTHERDATA.reportissubmitted = (res.newstatus === 'submitted') ? 1 : 0;
            }
        }).catch(function() {
            t.CONTENT_OTHERDATA.reportsaving = 0;
            if (isFinalSubmit) {
                t.CONTENT_OTHERDATA.reportstatus = 'submitted';
                t.CONTENT_OTHERDATA.reportissubmitted = 1;
            }
            idbPut('sync_queue', {
                cmid: cmid,
                type: 'report',
                payload: payload,
                timestamp: Date.now()
            }).catch(function() {});
        });
    };

    // =========================================================================
    // Q&A Discussions
    // =========================================================================

    var refreshDiscussionsList = function() {
        callWS('mod_smartvideo_get_discussions', {
            cmid: Number(t.CONTENT_OTHERDATA.cmid)
        }).then(function(res) {
            if (res && res.discussions) {
                t.discussionsList = res.discussions;
            }
        }).catch(function() {});
    };

    t.setReplyParent = function(parentId) {
        t.CONTENT_OTHERDATA.replyparentid = Number(parentId) || 0;
        t.CONTENT_OTHERDATA.replycontent = '';
    };

    t.cancelReply = function() {
        t.CONTENT_OTHERDATA.replyparentid = 0;
        t.CONTENT_OTHERDATA.replycontent = '';
    };

    t.postDiscussion = function(isReply) {
        var content = isReply ? t.CONTENT_OTHERDATA.replycontent : t.CONTENT_OTHERDATA.newquestioncontent;
        content = (content || '').trim();
        if (!content) {
            return;
        }
        var curSec = Math.floor(t.videoEl ? t.videoEl.currentTime : Number(t.CONTENT_OTHERDATA.currenttime) || 0);
        var parentId = isReply ? Number(t.CONTENT_OTHERDATA.replyparentid) : 0;

        callWS('mod_smartvideo_post_discussion', {
            cmid: Number(t.CONTENT_OTHERDATA.cmid),
            timecode: curSec,
            content: content,
            parentid: parentId
        }).then(function(res) {
            if (res && res.status) {
                if (isReply) {
                    t.CONTENT_OTHERDATA.replycontent = '';
                    t.CONTENT_OTHERDATA.replyparentid = 0;
                } else {
                    t.CONTENT_OTHERDATA.newquestioncontent = '';
                }
                refreshDiscussionsList();
            }
        }).catch(function() {});
    };

    t.deleteDiscussion = function(discId) {
        callWS('mod_smartvideo_delete_discussion', {
            cmid: Number(t.CONTENT_OTHERDATA.cmid),
            discussionid: Number(discId)
        }).then(function(res) {
            if (res && res.status) {
                refreshDiscussionsList();
            }
        }).catch(function() {});
    };

    // =========================================================================
    // Video Player Lifecycle & Playback Controller
    // =========================================================================

    var initVideoPlayer = function() {
        var video = document.getElementById('smartVideoMobileElement');
        if (!video) {
            return;
        }
        t.videoEl = video;
        var streamUrl = t.CONTENT_OTHERDATA.playlisturl || '';
        var cmid = Number(t.CONTENT_OTHERDATA.cmid);

        var attachStream = function() {
            var isOffline = Boolean(t.CONTENT_OTHERDATA.offlinedownloaded && t.offlineManifest && t.offlineManifest.playlisttext);

            loadHlsLibrary().then(function(Hls) {
                if (t.hlsInstance) {
                    try {
                        t.hlsInstance.destroy();
                    } catch (e) {}
                    t.hlsInstance = null;
                }

                if (isOffline && Hls && Hls.isSupported()) {
                    var hls = new Hls({
                        enableWorker: false,
                        loader: OfflineIdbLoader
                    });
                    hls.loadSource('offline://playlist.m3u8');
                    hls.attachMedia(video);
                    hls.on(Hls.Events.ERROR, function(event, data) {
                        if (data && data.fatal && data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                            hls.recoverMediaError();
                        }
                    });
                    t.hlsInstance = hls;
                    return;
                }

                var isM3u8 = streamUrl.indexOf('.m3u8') !== -1 || t.CONTENT_OTHERDATA.videotype === 'securelibrary';
                if (!isM3u8) {
                    video.src = streamUrl;
                    return;
                }

                if (Hls && Hls.isSupported()) {
                    var onlineHls = new Hls({
                        enableWorker: false,
                        xhrSetup: function(xhr, url) {
                            if (url && url.indexOf('key.php') !== -1) {
                                var match = /[?&]token=([a-fA-F0-9]+)/.exec(url);
                                if (match && match[1]) {
                                    xhr.setRequestHeader('X-Moodle-Player-Token', match[1]);
                                }
                            }
                        }
                    });
                    onlineHls.loadSource(streamUrl);
                    onlineHls.attachMedia(video);
                    onlineHls.on(Hls.Events.ERROR, function(event, data) {
                        if (data && data.fatal && data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                            onlineHls.recoverMediaError();
                        }
                    });
                    t.hlsInstance = onlineHls;
                } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                    video.src = streamUrl;
                } else {
                    video.src = streamUrl;
                }
            });
        };

        // Query offline manifest and restore local progress
        idbGet('manifests', cmid).then(function(savedManifest) {
            if (savedManifest) {
                t.offlineManifest = savedManifest;
                t.CONTENT_OTHERDATA.offlinedownloaded = 1;
                t.CONTENT_OTHERDATA.offlinequality = savedManifest.quality;
                t.CONTENT_OTHERDATA.offlinesizehuman = savedManifest.totalsize;

                if (savedManifest.questions && savedManifest.questions.length && (!t.questionsList || !t.questionsList.length)) {
                    t.questionsList = savedManifest.questions;
                }
                if (savedManifest.chapters && savedManifest.chapters.length && (!t.chaptersList || !t.chaptersList.length)) {
                    t.chaptersList = savedManifest.chapters;
                }
                if (savedManifest.callouts && savedManifest.callouts.length && (!t.calloutsList || !t.calloutsList.length)) {
                    t.calloutsList = savedManifest.callouts;
                }
                if (savedManifest.cues && savedManifest.cues.length && (!t.cuesList || !t.cuesList.length)) {
                    t.cuesList = savedManifest.cues;
                }
            }
            if (!navigator.onLine) {
                t.CONTENT_OTHERDATA.isofflinemode = 1;
            }
            return idbGet('local_state', cmid);
        }).then(function(localState) {
            if (localState) {
                if (Number(localState.currenttime) > Number(t.CONTENT_OTHERDATA.currenttime)) {
                    t.CONTENT_OTHERDATA.currenttime = Number(localState.currenttime);
                    t.CONTENT_OTHERDATA.currenttimeformatted = formatSeconds(localState.currenttime);
                }
                if (Number(localState.maxposition) > Number(t.CONTENT_OTHERDATA.maxposition)) {
                    t.CONTENT_OTHERDATA.maxposition = Number(localState.maxposition);
                }
                if (Number(localState.watchedseconds) > Number(t.CONTENT_OTHERDATA.watchedseconds)) {
                    t.CONTENT_OTHERDATA.watchedseconds = Number(localState.watchedseconds);
                }
                if (Number(localState.percentcompleted) > Number(t.CONTENT_OTHERDATA.percentcompleted)) {
                    t.CONTENT_OTHERDATA.percentcompleted = Number(localState.percentcompleted);
                }
                if (localState.watchedintervals) {
                    var merged = mergeIntervals(parseJsonSafe(localState.watchedintervals, []));
                    t.watchedIntervals = merged.merged;
                }
            }
        }).catch(function() {}).finally(function() {
            attachStream();
        });

        video.addEventListener('loadedmetadata', function() {
            if (video.duration && isFinite(video.duration) && !t.CONTENT_OTHERDATA.duration) {
                t.CONTENT_OTHERDATA.duration = Math.floor(video.duration);
                t.CONTENT_OTHERDATA.durationformatted = formatSeconds(video.duration);
            }
        });

        video.addEventListener('play', function() {
            t.CONTENT_OTHERDATA.isplaying = 1;
            t.lastTickSecond = Math.floor(video.currentTime || 0);
        });

        video.addEventListener('pause', function() {
            t.CONTENT_OTHERDATA.isplaying = 0;
            t.lastTickSecond = null;
            syncProgressToServer();
        });

        video.addEventListener('ended', function() {
            t.CONTENT_OTHERDATA.isplaying = 0;
            t.lastTickSecond = null;
            syncProgressToServer();
        });

        video.addEventListener('seeking', function() {
            if (!t.CONTENT_OTHERDATA.preventseeking) {
                return;
            }
            var maxAllowed = Number(t.CONTENT_OTHERDATA.maxposition) || 0;
            if (video.currentTime > maxAllowed + 2) {
                video.currentTime = maxAllowed;
            }
        });

        video.addEventListener('timeupdate', function() {
            var cur = video.currentTime || 0;
            var curSec = Math.floor(cur);
            var dur = Number(t.CONTENT_OTHERDATA.duration) || video.duration || 0;

            if (t.CONTENT_OTHERDATA.preventseeking) {
                var maxPos = Number(t.CONTENT_OTHERDATA.maxposition) || 0;
                if (cur > maxPos + 3) {
                    video.currentTime = maxPos;
                    return;
                }
            }

            if (!video.paused && t.lastTickSecond !== null) {
                var delta = curSec - t.lastTickSecond;
                if (delta >= 1 && delta <= 4) {
                    t.watchedIntervals.push([t.lastTickSecond, curSec]);
                    var mergedInfo = mergeIntervals(t.watchedIntervals);
                    t.watchedIntervals = mergedInfo.merged;
                    t.CONTENT_OTHERDATA.watchedseconds = mergedInfo.totalSeconds;
                    if (dur > 0) {
                        var pct = Math.min(100, Math.round((mergedInfo.totalSeconds / dur) * 100));
                        if (pct > Number(t.CONTENT_OTHERDATA.percentcompleted)) {
                            t.CONTENT_OTHERDATA.percentcompleted = pct;
                        }
                    }
                }
            }
            t.lastTickSecond = curSec;

            t.CONTENT_OTHERDATA.currenttime = curSec;
            t.CONTENT_OTHERDATA.currenttimeformatted = formatSeconds(curSec);
            if (curSec > Number(t.CONTENT_OTHERDATA.maxposition)) {
                t.CONTENT_OTHERDATA.maxposition = curSec;
            }

            if (dur > 0) {
                t.CONTENT_OTHERDATA.progresspercent = Math.min(100, Number(((cur / dur) * 100).toFixed(2)));
                t.CONTENT_OTHERDATA.maxpercent = Math.min(
                    100,
                    Number(((Number(t.CONTENT_OTHERDATA.maxposition) / dur) * 100).toFixed(2))
                );
            }

            // Subtitle cues check
            if (t.CONTENT_OTHERDATA.captionsenabled && t.cuesList && t.cuesList.length) {
                var foundCue = '';
                for (var cIdx = 0; cIdx < t.cuesList.length; cIdx++) {
                    var cue = t.cuesList[cIdx];
                    if (cur >= cue.start && cur <= cue.end) {
                        foundCue = cue.text;
                        break;
                    }
                }
                t.CONTENT_OTHERDATA.activecaption = foundCue;
            } else {
                t.CONTENT_OTHERDATA.activecaption = '';
            }

            // Timed callouts check
            var foundCallout = null;
            for (var kIdx = 0; kIdx < t.calloutsList.length; kIdx++) {
                var co = t.calloutsList[kIdx];
                var coEnd = co.timecode + (co.duration || 8);
                if (curSec >= co.timecode && curSec <= coEnd && !t.dismissedCalloutIds[co.id]) {
                    foundCallout = co;
                    break;
                }
            }
            if (foundCallout && (!t.activeCallout || t.activeCallout.id !== foundCallout.id)) {
                t.activeCallout = foundCallout;
                if (foundCallout.autopause && !video.paused) {
                    video.pause();
                    exitNativeFullscreenIfActive(video);
                }
            } else if (!foundCallout && t.activeCallout) {
                t.activeCallout = null;
            }

            // Interactive question cuepoints check
            if (!t.activeQuestion && t.triggeredQuestionAtSecond !== curSec) {
                for (var qIdx = 0; qIdx < t.questionsList.length; qIdx++) {
                    var q = t.questionsList[qIdx];
                    if (!q.passed && Math.abs(curSec - Number(q.timecode)) <= 1) {
                        t.triggeredQuestionAtSecond = curSec;
                        triggerQuestionAttempt(q, false);
                        break;
                    }
                }
            }
        });
    };

    var initTimer = setTimeout(initVideoPlayer, 250);

    var watermarkInterval = setInterval(function() {
        if (t.CONTENT_OTHERDATA.watermarkenabled) {
            t.CONTENT_OTHERDATA.watermarktop = 10 + Math.floor(Math.random() * 68);
            t.CONTENT_OTHERDATA.watermarkleft = 6 + Math.floor(Math.random() * 58);
        }
    }, 4500);

    var heartbeatInterval = setInterval(function() {
        if (t.videoEl && !t.videoEl.paused) {
            syncProgressToServer();
        }
        if (navigator.onLine) {
            flushSyncQueue();
        }
    }, 10000);

    t.ngOnDestroy = function() {
        clearTimeout(initTimer);
        clearInterval(watermarkInterval);
        clearInterval(heartbeatInterval);
        syncProgressToServer();
        if (t.hlsInstance) {
            try {
                t.hlsInstance.destroy();
            } catch (e) {}
            t.hlsInstance = null;
        }
    };
})(this);
