"""
Dataset generator for Indonesian personal finance transaction classification.
Generates comprehensive samples for 3 categories:
  - kebutuhan (Needs)
  - keinginan (Wants)
  - darurat   (Emergency)
"""

import random

# Seed data items per category
KEBUTUHAN_ITEMS = [
    "beras 5kg", "sembako mingguan", "sayur kangkung bayam", "sayuran pasar", "telur ayam 1kg",
    "minyak goreng bimoli", "gas elpiji 3kg", "tabung gas melon", "listrik pln", "token listrik rumah",
    "tagihan pdam air", "air galon aqua", "isi ulang air minum", "sewa kost bulanan", "bayar uang kost",
    "kontrakan rumah tahunan", "transport krl commuter line", "tiket mrt jakarta", "transjakarta bulanan",
    "bensin pertalite motor", "pertamax buat mobil", "ongkos angkot", "ojol ke kantor", "pulsa telkomsel",
    "paket data kuota internet", "tagihan indihome wifi", "sabun mandi lifebuoy", "sampo pantene",
    "pasta gigi odol pepsodent", "deterjen rinso cuci", "tisu dapur", "susu bayi sgm", "roti tawar sarapan",
    "makan siang warteg", "nasi padang hemat", "asuransi bpjs kesehatan", "iuran bpjs ketenagakerjaan",
    "spp sekolah anak", "biaya kuliah semester", "buku pelajaran modul", "seragam sekolah pramuka",
    "kebutuhan pokok bulanan", "obat generik apotek", "vitamin c daya tahan tubuh", "periksa dokter umum",
    "ganti oli motor servis rutin", "galon le minerale", "sabun cuci piring mama lemon", "laundry kiloan baju",
    "parkir bulanan kantor", "kebersihan rt iuran sampah", "cicilan motor honda beat", "cicilan kpr rumah"
]

KEINGINAN_ITEMS = [
    "kopi susu gula aren", "kopi kenangan mantan", "starbucks caramel macchiato", "chatime hazelnut boba",
    "bubble tea boba brown sugar", "thai tea dum dum", "matcha latte ice", "snack kentang chitato",
    "jajan cilok cireng", "coklat silverqueen", "es krim mixue boba sundae", "martabak manis keju spesial",
    "donat jco 1 lusin", "gorengan bakwan tahu", "nongkrong di cafe hits", "kafe kopi aesthetic",
    "restoran all you can eat", "makan shabu hachi", "food court mall grand indonesia", "top up diamond mobile legends",
    "game steam summer sale", "voucher valorant points", "langganan netflix premium", "spotify premium individual",
    "disney hotstar 1 tahun", "vidio premier liga inggris", "skincare serum somethinc", "sunscreen scarlett whitening",
    "kosmetik bedak maybelline", "makeup lip tint dior", "baju kaos oversize uniqlo", "hoodie h&m sablon",
    "sepatu sneakers nike air jordan", "sepatu converse chuck taylor", "tas ransel kanvas", "celana jeans levi's",
    "aksesoris kalung gelang", "rokok marlboro merah", "rokok surya 16", "vape pod cartridge liquid",
    "tiket nonton bioskop xxi", "imax tiket film marvel", "tiket konser coldplay jakarta", "liburan bali staycation",
    "villa ubud resort", "pesen gofood boba", "grabfood ayam geprek mozarella", "shopeefood boba time",
    "beli lego star wars", "action figure anime gundam", "jersey bola real madrid", "treatment salon potong rambut gaya"
]

DARURAT_ITEMS = [
    "rawat inap di ugd rumah sakit", "masuk igd mendadak tengah malam", "operasi usus buntu darurat",
    "kecelakaan motor tabrakan beruntun", "sewa ambulans darurat rujukan", "ban mobil bocor pecah di jalan tol",
    "ban motor kempes bocor kena paku", "tambal ban darurat malam hari", "atap genteng bocor parah rembes",
    "pipa air pdam jebol bocor banjir", "kemalingan dompet barang hilang", "kecopetan dompet di stasiun krl",
    "kebakaran korsleting listrik rumah", "kebanjiran air masuk rumah butuh pompa", "biaya takziah uang duka tetangga",
    "pemakaman keluarga meninggal dunia", "servis motor mogok mendadak di jalan", "perbaikan mobil mogok darurat",
    "beli obat darurat di ugd klinik 24 jam", "ganti kaca jendela pecah kena lempar", "servis rem blong motor mendadak",
    "tindakan darurat medis dokter spesialis", "obat asma kambuh mendadak beli malam", "kunci rumah patah panggil tukang kunci",
    "servis dinamo ac mati mendadak kebocoran gas", "tebus resep obat keras dokter igd"
]

PREFIXES = [
    "", "beli ", "abis beli ", "tadi beli ", "gua beli ", "gw abis beli ",
    "bayar ", "abis bayar ", "buat bayar ", "bayarin ", "checkout ",
    "pesen ", "order ", "jajan ", "keluar uang buat ", "pengeluaran "
]

AMOUNTS = [
    "", " 10rb", " 15k", " 20rb", " 25k", " 35rb", " 50rb", " 50k", " 75rb",
    " 100rb", " 120k", " 150rb", " 200rb", " 250rb", " 300rb", " 500rb",
    " 1jt", " 1,5jt", " 2jt", " 3,5jt", " 5jt"
]

def generate_samples(items, category, count=300, seed=42):
    random.seed(seed)
    samples = []
    
    # 1. Add base clean items
    for item in items:
        samples.append((item, category))
        
    # 2. Add templated combinations
    while len(samples) < count:
        item = random.choice(items)
        prefix = random.choice(PREFIXES)
        amount = random.choice(AMOUNTS)
        text = f"{prefix}{item}{amount}".strip()
        if (text, category) not in samples:
            samples.append((text, category))
            
    return samples[:count]

def get_dataset(samples_per_class=350, seed=42):
    """
    Returns a balanced list of (text, label) tuples.
    Classes: 'kebutuhan', 'keinginan', 'darurat'
    """
    kebutuhan = generate_samples(KEBUTUHAN_ITEMS, "kebutuhan", count=samples_per_class, seed=seed)
    keinginan = generate_samples(KEINGINAN_ITEMS, "keinginan", count=samples_per_class, seed=seed + 1)
    darurat = generate_samples(DARURAT_ITEMS, "darurat", count=samples_per_class, seed=seed + 2)
    
    all_data = kebutuhan + keinginan + darurat
    random.seed(seed)
    random.shuffle(all_data)
    
    texts = [row[0] for row in all_data]
    labels = [row[1] for row in all_data]
    return texts, labels

if __name__ == "__main__":
    X, y = get_dataset()
    print(f"Total samples: {len(X)}")
    from collections import Counter
    print(f"Class distribution: {Counter(y)}")
    print(f"Sample data:")
    for text, label in list(zip(X, y))[:5]:
        print(f"  - [{label.upper()}]: {text}")
