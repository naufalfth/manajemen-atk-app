from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.naive_bayes import MultinomialNB

class CategoryPredictor:
    def __init__(self):
        self.data_latih = [
            ("kertas hvs a4 70 gram", "Kertas & Buku"),
            ("buku tulis sidu 58 lembar", "Kertas & Buku"),
            ("buku gambar a3", "Kertas & Buku"),
            ("kertas folio bergaris", "Kertas & Buku"),
            
            ("pulpen joyko hitam", "Alat Tulis"),
            ("pensil 2b faber castell", "Alat Tulis"),
            ("spidol snowman boardmarker", "Alat Tulis"),
            ("penghapus joyko", "Alat Tulis"),
            ("tipex cair", "Alat Tulis"),
            
            ("tinta epson seri 664 hitam botol", "Tinta & Toner"),
            ("toner hp laserjet", "Tinta & Toner"),
            ("tinta stempel", "Tinta & Toner"),
            
            ("flashdisk sandisk 16gb", "Elektronik & Aksesoris"),
            ("mouse logitech wireless", "Elektronik & Aksesoris"),
            ("kalkulator citizen", "Elektronik & Aksesoris"),
            
            ("map plastik clear holder", "Organisasi File"),
            ("binder clip no 105", "Organisasi File"),
            ("staples max hd-10", "Organisasi File"),
            ("isi staples", "Organisasi File")
        ]
        self.vectorizer = TfidfVectorizer()
        self.model = MultinomialNB()
        self._train_model()

    def _train_model(self):
        X = [item[0] for item in self.data_latih]
        y = [item[1] for item in self.data_latih]
        X_vec = self.vectorizer.fit_transform(X)
        self.model.fit(X_vec, y)

    def predict(self, text: str) -> str:
        text_vec = self.vectorizer.transform([text.lower()])
        prediksi = self.model.predict(text_vec)
        return prediksi[0]

nlp = CategoryPredictor()