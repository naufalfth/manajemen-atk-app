import { useState, useEffect, useCallback, type FormEvent } from 'react';
import api from './api';
import './App.css';


const API_BASE_URL = ""; 
const WS_BASE_URL = `wss://${window.location.host}/ws`;

interface Barang {
  id: number;
  nama: string;
  stok: number;
  harga: number;
  kategori?: string;
  harga_pasar?: number; 
}

const getKategoriStyle = (kategori: string | undefined) => {
  if (!kategori) return { bg: '#f1f5f9', color: '#64748b' };
  switch (kategori) {
    case 'Kertas & Buku': return { bg: '#e0e7ff', color: '#4338ca' };
    case 'Alat Tulis': return { bg: '#fce7f3', color: '#be185d' };
    case 'Tinta & Toner': return { bg: '#dcfce3', color: '#15803d' };
    case 'Elektronik & Aksesoris': return { bg: '#ffedd5', color: '#c2410c' };
    case 'Organisasi File': return { bg: '#f3e8ff', color: '#7e22ce' };
    default: return { bg: '#f1f5f9', color: '#64748b' };
  }
};

function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [loginUsername, setLoginUsername] = useState<string>('');
  const [loginPassword, setLoginPassword] = useState<string>('');
  const [loginError, setLoginError] = useState<string>('');
  const [isRegisterMode, setIsRegisterMode] = useState<boolean>(false);
  const [showPassword, setShowPassword] = useState<boolean>(false);

  const [daftarBarang, setDaftarBarang] = useState<Barang[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [inputNama, setInputNama] = useState<string>('');
  const [inputStok, setInputStok] = useState<number | ''>('');
  const [inputHarga, setInputHarga] = useState<number | ''>('');
  const [editId, setEditId] = useState<number | null>(null);
  const [kataKunci, setKataKunci] = useState<string>('');

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoginError('');

    const formData = new URLSearchParams();
    formData.append('username', loginUsername);
    formData.append('password', loginPassword);
    
    try {
      // Pemanggilan menjadi sangat bersih dan bebas salah ketik URL
      const response = await api.post('/login', formData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      setToken(response.data.access_token);
      localStorage.setItem('token', response.data.access_token);
      setLoginUsername('');
      setLoginPassword('');
    } catch (error) {
      const err = error as { response?: { data?: { detail?: string } } };
      setLoginError(err.response?.data?.detail || "Username atau Password salah!");
    }
  };

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    setLoginError('');
    
    try {
      await api.post('/register', { 
        username: loginUsername, 
        password: loginPassword 
      });

      alert("Pendaftaran berhasil! Silakan masuk menggunakan akun baru Anda.");
      setIsRegisterMode(false);
      setLoginPassword('');
      setLoginUsername('');
    } catch (error) {
      const err = error as { response?: { data?: { detail?: string } } };
      setLoginError(err.response?.data?.detail || "Gagal melakukan registrasi");
    }
  };

  const handleLogout = () => {
    setToken(null);
    localStorage.removeItem('token');
    setDaftarBarang([]);
  };

  const fetchDataBarang = useCallback(() => {
    if (!token) return;
    fetch(`${API_BASE_URL}/api/barang`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then((res) => {
        if (res.status === 401) {
          handleLogout();
          throw new Error("Sesi berakhir");
        }
        return res.json();
      })
      .then((data) => { setDaftarBarang(data); setLoading(false); })
      .catch((err) => { console.error(err); setLoading(false); });
  }, [token]);

  useEffect(() => {
    fetchDataBarang();
  }, [fetchDataBarang]);

  useEffect(() => {
    if (!token) return;
    const ws = new WebSocket(`${WS_BASE_URL}/ws`);
    
    ws.onmessage = (event) => {
      if (event.data === "DATA_UPDATED") {
        fetch('http://localhost:8000/api/barang', {
          headers: { 'Authorization': `Bearer ${token}` }
        })
          .then(res => res.json())
          .then(data => setDaftarBarang(data))
          .catch(err => console.error("Gagal refresh data:", err));
      }
    };
    return () => { ws.close(); };
  }, [token]);

  const handleSimpanBarang = (e: FormEvent) => {
    e.preventDefault();
    if (!inputNama || inputStok === '' || inputHarga === '') {
      alert("Mohon isi semua kolom!"); return;
    }
    const payload = { nama: inputNama, stok: Number(inputStok), harga: Number(inputHarga) };
    const url = editId ? `${API_BASE_URL}/api/barang/${editId}` : `${API_BASE_URL}/api/barang`;
    
    fetch(url, {
      method: editId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(payload),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        return res.json();
      })
      .then(() => {
        resetForm();
        fetchDataBarang();
        alert(editId ? "Data berhasil diperbarui!" : "Barang berhasil ditambahkan!");
      })
      .catch((err) => console.error(err));
  };

  const handleHapusBarang = (id: number) => {
    if (!window.confirm("Yakin ingin menghapus barang ini?")) return;
    fetch(`${API_BASE_URL}/api/barang/${id}`, { 
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then((res) => {
        if (res.status === 403) {
          alert("Akses Ditolak: Hanya Super Admin yang bisa menghapus data.");
        } else if (res.ok) {
          fetchDataBarang();
        }
      });
  };

  const handleMulaiEdit = (barang: Barang) => {
    setEditId(barang.id); setInputNama(barang.nama); setInputStok(barang.stok); setInputHarga(barang.harga);
  };

  const resetForm = () => {
    setEditId(null); setInputNama(''); setInputStok(''); setInputHarga('');
  };

  const stokMenipis = daftarBarang.filter(b => b.stok < 20).length;
  const totalAset = daftarBarang.reduce((total, b) => total + (b.stok * b.harga), 0);
  const barangDitampilkan = daftarBarang.filter((barang) => 
    barang.nama.toLowerCase().includes(kataKunci.toLowerCase())
  );

  if (!token) {
    return (
      <div style={{ width: '100%', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f1f5f9', fontFamily: '"Inter", "Segoe UI", sans-serif', padding: '20px', boxSizing: 'border-box' }}>
        <div style={{ backgroundColor: '#ffffff', padding: '40px 30px', borderRadius: '24px', boxShadow: '0 10px 25px rgba(0,0,0,0.05)', width: '100%', maxWidth: '420px', border: '1px solid #e2e8f0', boxSizing: 'border-box' }}>
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ textAlign: 'center', marginBottom: '40px' }}>
              <div style={{ fontSize: '48px', marginBottom: '15px' }}>📦</div>
              <h2 style={{ margin: '0 0 10px 0', color: '#0f172a', fontSize: '28px', fontWeight: '800', letterSpacing: '-0.5px' }}>
                {isRegisterMode ? "Buat Akun Baru" : "Selamat Datang"}
              </h2>
              <p style={{ margin: 0, color: '#64748b', fontSize: '15px', lineHeight: '1.5' }}>
                {isRegisterMode ? "Daftar untuk mulai mengelola inventaris AI." : "Masuk ke Dashboard Inventaris Cerdas."}
              </p>
            </div>

            {loginError && (<div style={{ backgroundColor: '#fef2f2', color: '#b91c1c', padding: '14px', borderRadius: '12px', marginBottom: '25px', fontSize: '14px', textAlign: 'center', border: '1px solid #fecaca', fontWeight: '600' }}>⚠️ {loginError}</div>)}

            <form onSubmit={isRegisterMode ? handleRegister : handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '10px', fontSize: '12px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '1px' }}>Username</label>
                <input type="text" required value={loginUsername} onChange={(e) => setLoginUsername(e.target.value)} style={{ width: '100%', padding: '16px 20px', backgroundColor: '#f8fafc', border: '2px solid #e2e8f0', borderRadius: '12px', outline: 'none', boxSizing: 'border-box', fontSize: '15px', color: '#1e293b', fontWeight: '500', transition: 'border-color 0.2s' }} placeholder="Ketik username Anda..." />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '10px', fontSize: '12px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '1px' }}>Password</label>
                <div style={{ position: 'relative' }}>
                  <input 
                    type={showPassword ? "text" : "password"} 
                    required 
                    value={loginPassword} 
                    onChange={(e) => setLoginPassword(e.target.value)} 
                    style={{ width: '100%', padding: '16px 50px 16px 20px', backgroundColor: '#f8fafc', border: '2px solid #e2e8f0', borderRadius: '12px', outline: 'none', boxSizing: 'border-box', fontSize: '15px', color: '#1e293b', fontWeight: '500', transition: 'border-color 0.2s' }} 
                    placeholder="Ketik password rahasia..." 
                  />
                  <button 
                    type="button" 
                    onClick={() => setShowPassword(!showPassword)} 
                    style={{ position: 'absolute', right: '15px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', padding: '5px' }}
                    title={showPassword ? "Sembunyikan Password" : "Lihat Password"}
                  >
                    {showPassword ? "👁️" : "🙈"}
                  </button>
                </div>
              </div>

              <button type="submit" style={{ width: '100%', padding: '16px', background: isRegisterMode ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px', marginTop: '10px', boxShadow: isRegisterMode ? '0 10px 15px -3px rgba(16, 185, 129, 0.4)' : '0 10px 15px -3px rgba(37, 99, 235, 0.4)', transition: 'transform 0.1s' }}>
                {isRegisterMode ? "Daftarkan Sekarang" : "Masuk ke Dashboard"}
              </button>
            </form>

            <div style={{ marginTop: '30px', textAlign: 'center', fontSize: '14px', color: '#64748b' }}>
              {isRegisterMode ? "Sudah memiliki akun? " : "Belum bergabung? "}
              <span
                onClick={() => { 
                  setIsRegisterMode(!isRegisterMode); 
                  setLoginError(''); 
                  setLoginUsername(''); 
                  setLoginPassword(''); 
                }}
                style={{ color: isRegisterMode ? '#10b981' : '#2563eb', fontWeight: 'bold', cursor: 'pointer', paddingBottom: '2px' }}
              >
                {isRegisterMode ? "Masuk di sini" : "Buat akun di sini"}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', minHeight: '100vh', display: 'flex', justifyContent: 'center', backgroundColor: '#f1f5f9', fontFamily: '"Inter", "Segoe UI", sans-serif', padding: '40px 20px', boxSizing: 'border-box' }}>
      <div style={{ width: '100%', maxWidth: '1000px', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
          <div>
            <h1 style={{ margin: 0, color: '#0f172a', fontSize: '28px', fontWeight: '800' }}>Dashboard Inventaris</h1>
            <p style={{ margin: '5px 0 0 0', color: '#64748b', fontSize: '15px' }}>Sistem Manajemen Stok Barang</p>
          </div>
          <button onClick={handleLogout} style={{ padding: '10px 20px', backgroundColor: '#f8fafc', color: '#475569', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}>Keluar (Logout)</button>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '30px' }}>
          <div style={{ backgroundColor: '#ffffff', padding: '20px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', borderLeft: '4px solid #3b82f6' }}>
            <p style={{ margin: '0 0 5px 0', fontSize: '13px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase' }}>Total Jenis Barang</p>
            <h2 style={{ margin: 0, fontSize: '28px', color: '#0f172a' }}>{daftarBarang.length} <span style={{ fontSize: '14px', color: '#94a3b8', fontWeight: 'normal' }}>Item</span></h2>
          </div>
          <div style={{ backgroundColor: '#ffffff', padding: '20px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', borderLeft: '4px solid #ef4444' }}>
            <p style={{ margin: '0 0 5px 0', fontSize: '13px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase' }}>Peringatan Stok Tipis</p>
            <h2 style={{ margin: 0, fontSize: '28px', color: '#0f172a' }}>{stokMenipis} <span style={{ fontSize: '14px', color: '#ef4444', fontWeight: 'normal' }}>Perlu Restok</span></h2>
          </div>
          <div style={{ backgroundColor: '#ffffff', padding: '20px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', borderLeft: '4px solid #10b981' }}>
            <p style={{ margin: '0 0 5px 0', fontSize: '13px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase' }}>Estimasi Nilai Aset</p>
            <h2 style={{ margin: 0, fontSize: '28px', color: '#0f172a' }}>Rp {totalAset.toLocaleString('id-ID')}</h2>
          </div>
        </div>
        
        <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '30px', boxShadow: '0 10px 25px rgba(0,0,0,0.05)' }}>
          <div style={{ backgroundColor: editId ? '#f0f9ff' : '#f8fafc', padding: '20px', borderRadius: '12px', marginBottom: '30px', border: editId ? '1px solid #bae6fd' : '1px solid #e2e8f0' }}>
            <h3 style={{ marginTop: 0, color: editId ? '#0369a1' : '#334155', fontSize: '15px' }}>
              {editId ? `Mengedit Data (ID: ${editId})` : "Tambah Stok Baru"}
            </h3>
            <form className="form-tambah-container" onSubmit={handleSimpanBarang} style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="text" placeholder="Ketik nama barang (Cth: Tinta Epson Hitam)" value={inputNama} onChange={(e) => setInputNama(e.target.value)} style={{ backgroundColor: '#ffffff', color: '#1e293b', padding: '12px 16px', flex: 2, minWidth: '200px', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none', fontSize: '14px' }} />
              <input type="number" placeholder="Stok" value={inputStok} onChange={(e) => setInputStok(e.target.value ? Number(e.target.value) : '')} style={{ backgroundColor: '#ffffff', color: '#1e293b', padding: '12px 16px', flex: 1, minWidth: '100px', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none', fontSize: '14px' }} />
              <input type="number" placeholder="Harga Jual (Rp)" value={inputHarga} onChange={(e) => setInputHarga(e.target.value ? Number(e.target.value) : '')} style={{ backgroundColor: '#ffffff', color: '#1e293b', padding: '12px 16px', flex: 1, minWidth: '120px', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none', fontSize: '14px' }} />
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="submit" style={{ padding: '12px 24px', backgroundColor: editId ? '#0284c7' : '#2563eb', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', transition: 'background-color 0.2s' }}>{editId ? "Simpan Perubahan" : "Simpan & Auto-Kategori"}</button>
                {editId && (<button type="button" onClick={resetForm} style={{ padding: '12px 24px', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}>Batal</button>)}
              </div>
            </form>
          </div>

          <div className="header-container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
            <h3 style={{ margin: 0, color: '#1e293b', fontSize: '18px' }}>Daftar Inventaris</h3>
            <input type="text" placeholder="Cari nama barang..." value={kataKunci} onChange={(e) => setKataKunci(e.target.value)} style={{ backgroundColor: '#f8fafc', color: '#1e293b', padding: '10px 16px', width: '250px', border: '1px solid #e2e8f0', borderRadius: '20px', outline: 'none', fontSize: '13px' }} />
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>Memuat data dari server...</div>
          ) : (
            <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                    <th style={{ padding: '16px', color: '#475569', fontWeight: '600' }}>ID</th>
                    <th style={{ padding: '16px', color: '#475569', fontWeight: '600' }}>Nama Barang</th>
                    <th style={{ padding: '16px', color: '#475569', fontWeight: '600' }}>Kategori (AI)</th>
                    <th style={{ padding: '16px', color: '#475569', fontWeight: '600' }}>Stok Fisik</th>
                    <th style={{ padding: '16px', color: '#475569', fontWeight: '600' }}>Harga Satuan</th>
                    <th style={{ padding: '16px', color: '#475569', fontWeight: '600' }}>Harga Pasar (Web)</th>
                    <th style={{ padding: '16px', color: '#475569', fontWeight: '600', textAlign: 'center' }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {barangDitampilkan.map((barang, index) => {
                    const styleKategori = getKategoriStyle(barang.kategori);
                    return (
                      <tr key={barang.id} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: editId === barang.id ? '#f0f9ff' : 'transparent', transition: 'background-color 0.2s' }}>
                        <td style={{ padding: '16px', color: '#94a3b8' }}>{index + 1}</td>
                        <td style={{ padding: '16px', fontWeight: '600', color: '#1e293b' }}>{barang.nama}</td>
                        <td style={{ padding: '16px' }}>
                          <span style={{ backgroundColor: styleKategori.bg, color: styleKategori.color, padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '600' }}>
                            {barang.kategori || "Belum Diklasifikasi"}
                          </span>
                        </td>
                        <td style={{ padding: '16px' }}>
                          <span style={{ backgroundColor: barang.stok < 20 ? '#fee2e2' : '#dcfce3', color: barang.stok < 20 ? '#b91c1c' : '#166534', padding: '6px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold' }}>
                            {barang.stok} Pcs
                          </span>
                        </td>
                        <td style={{ padding: '16px', color: '#475569', fontWeight: '500' }}>Rp {barang.harga.toLocaleString('id-ID')}</td>
                        
                        <td style={{ padding: '16px', color: '#475569', fontWeight: '500' }}>
                          {barang.harga_pasar && barang.harga_pasar > 0 ? (
                            <span style={{ color: '#0ea5e9', fontSize: '13px', fontWeight: 'bold' }}>
                              ~ Rp {barang.harga_pasar.toLocaleString('id-ID')}
                            </span>
                          ) : (
                            <span style={{ color: '#94a3b8', fontSize: '12px', fontStyle: 'italic' }}>Mencari data...</span>
                          )}
                        </td>

                        <td style={{ padding: '16px', textAlign: 'center' }}>
                          <button onClick={() => handleMulaiEdit(barang)} style={{ margin: '0 4px', padding: '8px 14px', backgroundColor: '#f59e0b', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>Edit</button>
                          <button onClick={() => handleHapusBarang(barang.id)} style={{ margin: '0 4px', padding: '8px 14px', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>Hapus</button>
                        </td>
                      </tr>
                    );
                  })}
                  {barangDitampilkan.length === 0 && (
                    <tr><td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Barang tidak ditemukan.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;