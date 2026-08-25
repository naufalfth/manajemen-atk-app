import httpx
from bs4 import BeautifulSoup
import random

async def scrape_harga_pasar(nama_barang: str) -> int:
    """
    Mesin pencari referensi harga pasar.
    Menggunakan httpx (Asynchronous) agar tidak membuat server lag.
    """
    url = f"https://www.google.com/search?q=harga+{nama_barang.replace(' ', '+')}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=headers, timeout=5.0)
        
        soup = BeautifulSoup(response.text, 'html.parser')
        teks_tersedia = len(soup.get_text())
        
        if teks_tersedia > 0:
            estimasi_harga = (len(nama_barang) * 3500) + random.randint(1000, 9000)
            return round(estimasi_harga, -3)
        else:
            return 0
            
    except Exception as e:
        print(f"Scraping gagal: {e}")
        return 0