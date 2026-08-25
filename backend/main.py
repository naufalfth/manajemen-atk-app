import os
from datetime import datetime, timedelta
from typing import List

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, status, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlalchemy import Column, Integer, String, create_engine
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from backend.nlp_engine import nlp
from backend.scraper_engine import scrape_harga_pasar

load_dotenv()
SECRET_KEY = os.getenv("SECRET_KEY", "kunci_rahasia_toko_atk_super_aman_123_default")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/login")

SQLALCHEMY_DATABASE_URL = "sqlite:////tmp/inventaris_atk.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class BarangDB(Base):
    __tablename__ = "barang"
    id = Column(Integer, primary_key=True, index=True)
    nama = Column(String, index=True)
    stok = Column(Integer)
    harga = Column(Integer)
    kategori = Column(String)
    harga_pasar = Column(Integer, default=0)

class UserDB(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    role = Column(String)

Base.metadata.create_all(bind=engine)

class UserCreate(BaseModel):
    username: str
    password: str

class BarangCreate(BaseModel):
    nama: str
    stok: int
    harga: int

class Barang(BarangCreate):
    id: int
    kategori: str
    harga_pasar: int
    class Config: from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

app = FastAPI()
from mangum import Mangum
handler = Mangum(app)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

class ConnectionManager:
    def __init__(self): self.active_connections: List[WebSocket] = []
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections: self.active_connections.remove(websocket)
    async def broadcast(self, message: str):
        for connection in list(self.active_connections):
            try: await connection.send_text(message)
            except Exception: self.disconnect(connection)

manager = ConnectionManager()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True: await websocket.receive_text()
    except Exception: manager.disconnect(websocket)

def get_db():
    db = SessionLocal()
    try: yield db
    finally: db.close()

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if not username: raise HTTPException(status_code=401, detail="Token tidak valid")
    except JWTError: raise HTTPException(status_code=401, detail="Token tidak valid")
    user = db.query(UserDB).filter(UserDB.username == username).first()
    if not user: raise HTTPException(status_code=401, detail="Token tidak valid")
    return user

@app.post("/api/login", response_model=Token)
def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(UserDB).filter(UserDB.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Username/Password salah")
    access_token = create_access_token(data={"sub": user.username, "role": user.role}, expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/api/register")
def register_user(user: UserCreate, db: Session = Depends(get_db)):
    # Cek apakah username sudah dipakai orang lain
    existing_user = db.query(UserDB).filter(UserDB.username == user.username).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Username sudah terdaftar, pilih yang lain")
    
    new_user = UserDB(
        username=user.username,
        hashed_password=get_password_hash(user.password),
        role="user" 
    )
    db.add(new_user)
    db.commit()
    return {"pesan": "Registrasi berhasil"}

@app.get("/api/barang", response_model=List[Barang])
def get_semua_barang(db: Session = Depends(get_db), current_user: UserDB = Depends(get_current_user)):
    return db.query(BarangDB).all()

@app.post("/api/barang", response_model=Barang)
async def tambah_barang(barang_baru: BarangCreate, db: Session = Depends(get_db), current_user: UserDB = Depends(get_current_user)):
    prediksi_kategori = nlp.predict(barang_baru.nama)
    
    estimasi_harga_pasar = await scrape_harga_pasar(barang_baru.nama)

    db_item = BarangDB(
        nama=barang_baru.nama, stok=barang_baru.stok, harga=barang_baru.harga,
        kategori=prediksi_kategori,
        harga_pasar=estimasi_harga_pasar
    )
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    await manager.broadcast("DATA_UPDATED")
    return db_item

@app.put("/api/barang/{barang_id}", response_model=Barang)
async def update_barang(barang_id: int, barang_update: BarangCreate, db: Session = Depends(get_db), current_user: UserDB = Depends(get_current_user)):
    db_item = db.query(BarangDB).filter(BarangDB.id == barang_id).first()
    if not db_item: raise HTTPException(status_code=404, detail="Barang tidak ditemukan")
    
    db_item.kategori = nlp.predict(barang_update.nama)
    db_item.harga_pasar = await scrape_harga_pasar(barang_update.nama)
    
    db_item.nama = barang_update.nama
    db_item.stok = barang_update.stok
    db_item.harga = barang_update.harga
    db.commit()
    db.refresh(db_item)
    await manager.broadcast("DATA_UPDATED")
    return db_item

@app.delete("/api/barang/{barang_id}")
async def hapus_barang(barang_id: int, db: Session = Depends(get_db), current_user: UserDB = Depends(get_current_user)):
    barang_dihapus = db.query(BarangDB).filter(BarangDB.id == barang_id).first()
    if not barang_dihapus: raise HTTPException(status_code=404, detail="Barang tidak ditemukan")
    db.delete(barang_dihapus)
    db.commit()
    await manager.broadcast("DATA_UPDATED")
    return {"pesan": "Berhasil menghapus"}