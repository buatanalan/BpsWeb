'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { getTestPrivateKey, searchResidentsByHash } from './actions';
import { decryptHybridClient, generateBlindIndex } from '@/lib/cryptoClient';

export default function ResidentList({ initialResidents }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState('');
  const [filteredResidents, setFilteredResidents] = useState(initialResidents);
  const [selectedResident, setSelectedResident] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // States for manual decryption/unlocking feature inside sidebar using Private Key
  const [privateKey, setPrivateKey] = useState('');
  const [sidebarKeyFileName, setSidebarKeyFileName] = useState('');
  const [unlockedData, setUnlockedData] = useState(null);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState('');
  
  // Local storage keys configuration states
  const [globalPrivateKey, setGlobalPrivateKey] = useState('');
  const [tempPrivateKey, setTempPrivateKey] = useState('');
  const [tempKeyFileName, setTempKeyFileName] = useState('');
  const [shouldSaveLocal, setShouldSaveLocal] = useState(false);

  // Cache for fully decrypted resident data: { [id]: { nama, nik, no_kk, alamat_ktp, desil } }
  const [decryptedCache, setDecryptedCache] = useState({});

  // Searching status
  const [isSearching, setIsSearching] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);

  // Environment variables
  const hmacSecretKey = process.env.NEXT_PUBLIC_HMAC_SECRET_KEY || '';

  // Load keys from localStorage on mount (Client-side only)
  useEffect(() => {
    const savedPrivKey = localStorage.getItem('bapa_private_key') || '';
    setGlobalPrivateKey(savedPrivKey);
    setTempPrivateKey(savedPrivKey);
    if (savedPrivKey) {
      setTempKeyFileName('Kunci disimpan secara lokal');
    }
  }, []);

  // Sync state query with URL parameters on mount/popstate
  useEffect(() => {
    const q = searchParams.get('q') || '';
    setQuery(q);
  }, [searchParams]);

  // Automatically decrypt search result rows locally in the browser when key or results change
  useEffect(() => {
    const decryptResults = async () => {
      // Private key is required to decrypt details and show them on the cards
      if (!globalPrivateKey || filteredResidents.length === 0) {
        setDecryptedCache({});
        return;
      }
      
      const cache = {};
      try {
        await Promise.all(
          filteredResidents.map(async (res) => {
            const nameDecrypted = await decryptHybridClient(res.nama, globalPrivateKey);
            const nikDecrypted = await decryptHybridClient(res.nik, globalPrivateKey);
            const kkDecrypted = await decryptHybridClient(res.no_kk, globalPrivateKey);
            const alamatDecrypted = await decryptHybridClient(res.alamat_ktp, globalPrivateKey);
            const desilDecrypted = await decryptHybridClient(res.desil, globalPrivateKey);

            if (nameDecrypted && nikDecrypted && kkDecrypted && alamatDecrypted && desilDecrypted) {
              cache[res.id] = { 
                nama: nameDecrypted, 
                nik: nikDecrypted,
                no_kk: kkDecrypted,
                alamat_ktp: alamatDecrypted,
                desil: parseInt(desilDecrypted)
              };
            }
          })
        );
        setDecryptedCache(cache);
      } catch (err) {
        console.error('Failed to decrypt search results locally:', err);
      }
    };
    decryptResults();
  }, [filteredResidents, globalPrivateKey]);

  // File Upload Helper to read RSA Private Key PEM
  const handlePrivateKeyFileChange = (e, targetSetter, fileNameSetter) => {
    const file = e.target.files[0];
    if (!file) return;

    if (fileNameSetter) fileNameSetter(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      targetSetter(text);
    };
    reader.readAsText(file);
  };

  // Performs Searchable Encryption: Hashing query in browser and querying server by hash index
  const performSearch = async (searchQuery) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) {
      setFilteredResidents([]);
      return;
    }

    setIsSearching(true);
    try {
      if (!hmacSecretKey) {
        console.warn('NEXT_PUBLIC_HMAC_SECRET_KEY is not configured in environment variables.');
        setFilteredResidents([]);
        return;
      }

      // Compute HMAC-SHA256 signature in browser using static HMAC key
      const searchHash = await generateBlindIndex(q, hmacSecretKey);

      // Query DB through server action by sending only the search hash
      const result = await searchResidentsByHash(searchHash);
      if (result.success) {
        setFilteredResidents(result.data);
      } else {
        setFilteredResidents([]);
      }
    } catch (err) {
      console.error('Searchable encryption query failed:', err);
      setFilteredResidents([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Live debounced search as user types
  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      performSearch(query);
    }, 300); // 300ms debounce

    return () => clearTimeout(delayDebounce);
  }, [query]);

  // Lock scrolling on page body when sidebar panel is open
  useEffect(() => {
    if (isSidebarOpen) {
      document.body.classList.add('sidebar-open');
    } else {
      document.body.classList.remove('sidebar-open');
    }
    return () => document.body.classList.remove('sidebar-open');
  }, [isSidebarOpen]);

  // Close sidebar on Escape key press
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsSidebarOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handle instant search when Cari is clicked or Enter is pressed
  const handleSearch = () => {
    performSearch(query);
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const openSidebar = (res) => {
    setSelectedResident(res);
    setUnlockedData(null);
    setPrivateKey('');
    setSidebarKeyFileName('');
    setUnlockError('');
    setIsSidebarOpen(true);

    // Load decrypted data directly from cached state if private key was saved
    if (decryptedCache[res.id]) {
      setUnlockedData(decryptedCache[res.id]);
    }
  };

  const closeSidebar = () => {
    setIsSidebarOpen(false);
  };

  // Perform manual unlocking decryption using inputted Private Key inside the sidebar details panel
  const handleUnlock = async () => {
    if (!privateKey.trim()) {
      setUnlockError('Kunci privat tidak boleh kosong.');
      return;
    }

    setIsUnlocking(true);
    setUnlockError('');

    try {
      const nameDecrypted = await decryptHybridClient(selectedResident.nama, privateKey);
      const nikDecrypted = await decryptHybridClient(selectedResident.nik, privateKey);
      const kkDecrypted = await decryptHybridClient(selectedResident.no_kk, privateKey);
      const alamatDecrypted = await decryptHybridClient(selectedResident.alamat_ktp, privateKey);
      const desilDecrypted = await decryptHybridClient(selectedResident.desil, privateKey);
      
      if (nameDecrypted && nikDecrypted && kkDecrypted && alamatDecrypted && desilDecrypted) {
        const data = { 
          nama: nameDecrypted, 
          nik: nikDecrypted,
          no_kk: kkDecrypted,
          alamat_ktp: alamatDecrypted,
          desil: parseInt(desilDecrypted)
        };
        setUnlockedData(data);
        if (shouldSaveLocal) {
          localStorage.setItem('bapa_private_key', privateKey.trim());
          setGlobalPrivateKey(privateKey.trim());
          setTempPrivateKey(privateKey.trim());
          setTempKeyFileName('Kunci disimpan secara lokal');
        }
      } else {
        setUnlockError('Gagal mendekripsi data. Kunci privat tidak cocok atau salah format.');
      }
    } catch (error) {
      setUnlockError('Gagal mendekripsi. Pastikan format Private Key PEM benar.');
      console.error('Failed to unlock:', error);
    } finally {
      setIsUnlocking(false);
    }
  };

  const handleLock = () => {
    setUnlockedData(null);
    setPrivateKey('');
    setSidebarKeyFileName('');
    setUnlockError('');
  };

  const handleSaveKey = (privKey) => {
    // Save Private Key (for decryption)
    if (privKey.trim()) {
      localStorage.setItem('bapa_private_key', privKey.trim());
      setGlobalPrivateKey(privKey.trim());
      setTempKeyFileName('Kunci disimpan secara lokal');
    } else {
      localStorage.removeItem('bapa_private_key');
      setGlobalPrivateKey('');
      setTempKeyFileName('');
    }
  };

  const handleClearKey = () => {
    localStorage.removeItem('bapa_private_key');
    setGlobalPrivateKey('');
    setTempPrivateKey('');
    setTempKeyFileName('');
    setUnlockedData(null);
    setDecryptedCache({});
    setFilteredResidents([]);
  };

  return (
    <>
      <header>
        <div className="search-container">
          <div className="search-icon">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input 
            type="text" 
            className="search-input" 
            placeholder={hmacSecretKey ? "Cari nama atau NIK asli penduduk..." : "Konfigurasi NEXT_PUBLIC_HMAC_SECRET_KEY diperlukan..."}
            aria-label="Cari nama atau NIK asli penduduk"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            disabled={!hmacSecretKey}
          />
          {isSearching && <span className="search-loading-spinner" title="Sedang mencari..."></span>}
          <button className="search-button" onClick={handleSearch} disabled={isSearching || !hmacSecretKey}>
            {isSearching ? 'Mencari...' : 'Cari'}
          </button>
        </div>
      </header>

      {/* Panel Pengaturan Kunci Privat Browser */}
      <section className="key-config-panel">
        <button 
          className="key-config-toggle"
          onClick={() => setIsConfigOpen(!isConfigOpen)}
        >
          <div className="toggle-left">
            <span className="toggle-icon">🔑</span>
            <span className="toggle-text">Pengaturan Kunci RSA Browser (Dekripsi Data)</span>
          </div>
          <div className="toggle-right">
            <span className={`key-status-badge ${globalPrivateKey ? 'active' : 'inactive'}`}>
              {globalPrivateKey ? 'Kunci Dekripsi Aktif (Admin Mode)' : 'Kunci Belum Diatur'}
            </span>
            <svg className={`chevron-icon ${isConfigOpen ? 'open' : ''}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>

        {isConfigOpen && (
          <div className="key-config-body">
            <p className="config-desc">
              Unggah berkas <b>RSA Private Key (.pem)</b> Anda di bawah untuk mengaktifkan fitur dekripsi data penduduk secara lokal di browser Anda. Kunci ini disimpan di <code>localStorage</code> browser Anda dan tidak pernah dikirimkan ke server.
            </p>
            
            <div className="key-input-block">
              <label className="key-input-label">Private Key RSA (.pem)</label>
              <div className="file-upload-wrapper">
                <label className="file-upload-label">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="file-upload-icon">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  <span>{tempKeyFileName ? tempKeyFileName : 'Pilih berkas Private Key (.pem / .key / .txt)'}</span>
                  <input 
                    type="file" 
                    accept=".pem,.key,.txt" 
                    className="hidden-file-input" 
                    onChange={(e) => handlePrivateKeyFileChange(e, setTempPrivateKey, setTempKeyFileName)}
                    disabled={isUnlocking}
                  />
                </label>
              </div>
            </div>

            <div className="config-actions">
              <button 
                type="button" 
                className="config-btn save-btn"
                onClick={() => handleSaveKey(tempPrivateKey)}
                disabled={!tempPrivateKey}
              >
                Simpan Kunci
              </button>
              {globalPrivateKey && (
                <button 
                  type="button" 
                  className="config-btn clear-btn"
                  onClick={handleClearKey}
                >
                  Hapus Kunci
                </button>
              )}
              <button 
                type="button" 
                className="config-btn test-btn"
                onClick={async () => {
                  try {
                    const testPriv = await getTestPrivateKey();
                    if (testPriv) {
                      setTempPrivateKey(testPriv);
                      handleSaveKey(testPriv);
                      setTempKeyFileName('Kunci Uji Coba Terpasang');
                    }
                  } catch (e) {
                    console.error('Failed to load test key:', e);
                  }
                }}
              >
                Gunakan Kunci Uji Coba
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Grid Kartu Mendatar */}
      <section className="card-grid">
        {!hmacSecretKey ? (
          <div className="search-prompt">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <h3>Konfigurasi Kunci HMAC Diperlukan</h3>
            <p>Silakan isi variabel lingkungan <code>NEXT_PUBLIC_HMAC_SECRET_KEY</code> pada berkas <code>.env.local</code> proyek Anda terlebih dahulu untuk memulai.</p>
          </div>
        ) : query.trim() === '' ? (
          <div className="search-prompt">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <h3>Mulai Pencarian Data</h3>
            <p>Silakan ketik nama atau NIK penduduk pada kolom di atas untuk menemukan data.</p>
          </div>
        ) : (
          <>
            {filteredResidents.map((res, index) => {
              const btnClass = index % 2 === 0 ? 'solid' : 'outline';
              const isDecrypted = !!decryptedCache[res.id];
              const displayName = isDecrypted ? decryptedCache[res.id].nama : '🔒 [Nama Terkunci]';
              const displayNik = isDecrypted ? decryptedCache[res.id].nik : '🔒 [NIK Terkunci]';

              return (
                <article key={res.id} className="card">
                  <div className="card-content">
                    <h2 className="card-title-line">{displayName}</h2>
                    <p className="card-desc-line">NIK: {displayNik}</p>
                  </div>
                  <button 
                    className={`card-action-btn ${btnClass}`}
                    onClick={() => openSidebar(res)}
                  >
                    Detail
                  </button>
                </article>
              );
            })}

            {/* Empty state displayed if filtered results is empty */}
            <div className={`empty-state ${filteredResidents.length === 0 ? 'visible' : ''}`}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h3>Data Tidak Ditemukan</h3>
              <p>Maaf, data dengan nama atau NIK tersebut tidak tersedia.</p>
            </div>
          </>
        )}
      </section>

      {/* Background Overlay */}
      <div 
        className={`sidebar-overlay ${isSidebarOpen ? 'active' : ''}`}
        onClick={closeSidebar}
      />

      {/* Sidebar Panel Details */}
      <aside 
        id="detailsSidebar" 
        className={`details-sidebar ${isSidebarOpen ? 'open' : ''}`}
        aria-hidden={!isSidebarOpen}
      >
        <div className="sidebar-header">
          <h2>Detail Penduduk</h2>
          <button className="close-sidebar-btn" onClick={closeSidebar} aria-label="Tutup Detail">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {selectedResident && (
          <div className="sidebar-body">
            {unlockedData && (
              <div className="unlocked-banner">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="unlocked-banner-icon">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                </svg>
                <span>🔓 Mode Buka Kunci (Data Asli)</span>
              </div>
            )}

            <div className="detail-item">
              <label>Nama Lengkap</label>
              <div className="detail-val-wrapper">
                <span className={`detail-icon ${unlockedData ? 'unlocked' : 'locked'}`} title={unlockedData ? 'Data asli' : 'Data disamarkan (aliasing)'}>
                  {unlockedData ? '🔓' : '🔒'}
                </span>
                <div className={`detail-val ${unlockedData ? 'unlocked-text' : 'locked-text'}`}>
                  {unlockedData ? unlockedData.nama : '🔒 [Nama Terkunci]'}
                </div>
              </div>
            </div>

            <div className="detail-item">
              <label>NIK (Nomor Induk Kependudukan)</label>
              <div className="detail-val-wrapper">
                <span className={`detail-icon ${unlockedData ? 'unlocked' : 'locked'}`} title={unlockedData ? 'Data asli' : 'Data disamarkan (aliasing)'}>
                  {unlockedData ? '🔓' : '🔒'}
                </span>
                <div className={`detail-val ${unlockedData ? 'unlocked-text' : 'locked-text'}`}>
                  {unlockedData ? unlockedData.nik : '🔒 [NIK Terkunci]'}
                </div>
              </div>
            </div>

            <div className="detail-item">
              <label>Nomor KK (Kartu Keluarga)</label>
              <div className="detail-val-wrapper">
                <span className={`detail-icon ${unlockedData ? 'unlocked' : 'locked'}`} title={unlockedData ? 'Data asli' : 'Data disamarkan (aliasing)'}>
                  {unlockedData ? '🔓' : '🔒'}
                </span>
                <div className={`detail-val ${unlockedData ? 'unlocked-text' : 'locked-text'}`}>
                  {unlockedData ? unlockedData.no_kk : '🔒 [Nomor KK Terkunci]'}
                </div>
              </div>
            </div>

            <div className="detail-item">
              <label>Alamat KTP</label>
              <div className="detail-val-wrapper">
                <span className={`detail-icon ${unlockedData ? 'unlocked' : 'locked'}`} title={unlockedData ? 'Data asli' : 'Data disamarkan (aliasing)'}>
                  {unlockedData ? '🔓' : '🔒'}
                </span>
                <div className={`detail-val alamat-style ${unlockedData ? 'unlocked-text' : 'locked-text'}`}>
                  {unlockedData ? unlockedData.alamat_ktp : '🔒 [Alamat Terkunci]'}
                </div>
              </div>
            </div>

            <div className="detail-item">
              <label>Desil Kesejahteraan</label>
              {unlockedData ? (
                <div className="desil-container">
                  <span className={`desil-badge desil-${unlockedData.desil}`}>
                    Desil {unlockedData.desil}
                  </span>
                </div>
              ) : (
                <div className="detail-val-wrapper">
                  <span className="detail-icon locked">🔒</span>
                  <div className="detail-val locked-text">[Desil Terkunci]</div>
                </div>
              )}
            </div>

            {/* Input unlock Private Key */}
            <div className="unlock-section">
              {!unlockedData ? (
                <div className="unlock-form">
                  <h3>Buka Kunci Data Asli (RSA)</h3>
                  <p>Unggah berkas RSA Private Key (.pem) untuk mendekripsi data aliasing penduduk ini.</p>
                  
                  <div className="unlock-helper-actions">
                    <button
                      type="button"
                      className="load-test-key-btn"
                      onClick={async () => {
                        try {
                          const testKey = await getTestPrivateKey();
                          if (testKey) {
                            setPrivateKey(testKey);
                            setSidebarKeyFileName('Kunci Uji Coba Terpasang');
                            setUnlockError('');
                          } else {
                            setUnlockError('Private key uji coba tidak ditemukan di server.');
                          }
                        } catch (err) {
                          setUnlockError('Gagal memuat private key uji coba.');
                        }
                      }}
                    >
                      🔑 Muat Private Key Uji Coba
                    </button>
                  </div>

                  <div className="unlock-textarea-container">
                    <div className="file-upload-wrapper">
                      <label className="file-upload-label">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="file-upload-icon">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        <span>{sidebarKeyFileName ? sidebarKeyFileName : 'Pilih berkas Private Key (.pem / .key / .txt)'}</span>
                        <input 
                          type="file" 
                          accept=".pem,.key,.txt" 
                          className="hidden-file-input" 
                          onChange={(e) => handlePrivateKeyFileChange(e, setPrivateKey, setSidebarKeyFileName)}
                          disabled={isUnlocking}
                        />
                      </label>
                    </div>
                  </div>

                  <div className="checkbox-container">
                    <input 
                      type="checkbox" 
                      id="saveKeyCheckbox" 
                      checked={shouldSaveLocal}
                      onChange={(e) => setShouldSaveLocal(e.target.checked)}
                    />
                    <label htmlFor="saveKeyCheckbox">Simpan kunci ini secara lokal di browser</label>
                  </div>

                  {unlockError && <div className="unlock-error-message">{unlockError}</div>}

                  <button
                    className="unlock-submit-button wide-btn"
                    onClick={handleUnlock}
                    disabled={isUnlocking || !privateKey}
                  >
                    {isUnlocking ? 'Mendekripsi...' : 'Buka Kunci Data'}
                  </button>
                </div>
              ) : (
                <div className="unlock-form">
                  <button className="lock-again-button" onClick={handleLock}>
                    🔒 Kunci Kembali Data
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
