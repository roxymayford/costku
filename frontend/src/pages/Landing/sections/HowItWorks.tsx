import React from 'react';
import { StackCards, StackCardItem } from '../../../components/motion/StackCards';

const HOW_IT_WORKS: StackCardItem[] = [
  {
    n: '01',
    title: 'Isi gaji.',
    line: 'Cukup sekali di awal bulan.',
    desc: 'Masukkan total penghasilan bersihmu saat gajian tiba. Angka ini jadi fondasi perhitungan otomatis tanpa perlu repot mencatat mutasi berulang-ulang.',
  },
  {
    n: '02',
    title: 'Isi biaya tetap.',
    line: 'Kost, cicilan, & tagihan wajib.',
    desc: 'Daftarkan pengeluaran rutin serta target tabunganmu. Dana wajib langsung diamankan di awal, sehingga kebutuhan pokokmu selalu terlindungi.',
  },
  {
    n: '03',
    title: 'Dapat angka harian.',
    line: 'Satu batas jajan: Rp 85.000 / hari.',
    desc: 'Sisa uang dibagi merata ke sisa hari dalam sebulan. Cukup pastikan jajan harianmu di bawah angka ini—akhir bulan dijamin tetap tenang dan tabungan utuh.',
  },
];

export const HowItWorks: React.FC = () => {
  return (
    <section id="cara-kerja" className="lp-how">
      <div className="swiss-section-meta">
        <span>CARA KERJA</span>
        <span>3 LANGKAH</span>
      </div>
      <StackCards items={HOW_IT_WORKS} />
    </section>
  );
};
