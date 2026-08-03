'use client';

import { useState, useEffect } from 'react';

export default function ResidentList({ initialResidents }) {
  const [query, setQuery] = useState('');
  const [filteredResidents, setFilteredResidents] = useState(initialResidents);
  const [selectedResident, setSelectedResident] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Live filter residents list based on search query
  useEffect(() => {
    const q = query.toLowerCase().trim();
    if (!q) {
      setFilteredResidents(initialResidents);
    } else {
      const filtered = initialResidents.filter(
        r => r.nama.toLowerCase().includes(q) || r.nik.toLowerCase().includes(q)
      );
      setFilteredResidents(filtered);
    }
  }, [query, initialResidents]);

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

  const openSidebar = (res) => {
    setSelectedResident(res);
    setIsSidebarOpen(true);
  };

  const closeSidebar = () => {
    setIsSidebarOpen(false);
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
            placeholder="Cari nama atau NIK penduduk..." 
            aria-label="Cari nama atau NIK penduduk"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="search-button" onClick={() => {}}>Cari</button>
        </div>
      </header>

      {/* Grid Kartu Mendatar */}
      <section className="card-grid">
        {filteredResidents.map((res, index) => {
          const btnClass = index % 2 === 0 ? 'solid' : 'outline';
          return (
            <article key={res.id} className="card">
              <div className="card-content">
                <h2 className="card-title-line">{res.nama}</h2>
                <p className="card-desc-line">NIK: {res.nik}</p>
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
            <div className="detail-item">
              <label>Nama Lengkap</label>
              <div className="detail-val">{selectedResident.nama}</div>
            </div>
            <div className="detail-item">
              <label>NIK (Nomor Induk Kependudukan)</label>
              <div className="detail-val">{selectedResident.nik}</div>
            </div>
            <div className="detail-item">
              <label>Nomor KK (Kartu Keluarga)</label>
              <div className="detail-val">{selectedResident.no_kk}</div>
            </div>
            <div className="detail-item">
              <label>Alamat KTP</label>
              <div className="detail-val alamat-style">{selectedResident.alamat_ktp}</div>
            </div>
            <div className="detail-item">
              <label>Desil Kesejahteraan</label>
              <div className="desil-container">
                <span className={`desil-badge desil-${selectedResident.desil}`}>
                  Desil {selectedResident.desil}
                </span>
              </div>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
