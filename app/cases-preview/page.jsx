import Link from 'next/link';
import styles from './showroom.module.css';

export const metadata = {
  title: 'NEW PRO · New Cases',
  description: 'Yangi oltita case kolleksiyasi: dizayn va sovg‘alar oldindan ko‘rish.',
};

const cases = [
  {slug:'starter',name:'Starter Case',label:'BOSHLANG‘ICH',price:10,color:'#56dfff',gift:'Input Key #45302',text:'Ko‘k kiber sandiq'},
  {slug:'neon',name:'Neon Case',label:'CYBER',price:50,color:'#fa66de',gift:'Surge Board #124',text:'Neon energiya'},
  {slug:'serpent',name:'Serpent Case',label:'RARE',price:100,color:'#4af4b8',gift:'Snake Box #11059',text:'Zumrad xazina'},
  {slug:'champion',name:'Champion Case',label:'EPIC',price:250,color:'#ffc37a',gift:'Victory Medal #40151',text:'G‘alaba sandig‘i'},
  {slug:'quantum',name:'Quantum Case',label:'ELITE',price:500,color:'#b296ff',gift:'Ufs Box',text:'Binafsha olmos'},
  {slug:'royal-vault',name:'Royal Vault Case',label:'ROYAL',price:1000,color:'#f3c960',gift:'Ufc box 2',text:'Oltin toj xazinasi'},
];

export default function NewCaseShowroom() {
  return (
    <main className={styles.page}>
      <div className={styles.ambient} aria-hidden="true"/>
      <header className={styles.header}>
        <div className={styles.brand}>✦ NEW PRO <span>CASE COLLECTION</span></div>
        <Link href="/webapp" className={styles.return}>Mini App <span aria-hidden="true">↗</span></Link>
      </header>
      <section className={styles.intro}>
        <span className={styles.eyebrow}>PREVIEW / 06 NEW CASES</span>
        <h1>Yangi case’lar <em>tayyor.</em></h1>
        <p>Har bir case uchun alohida muqova, 5 xil Stars mukofoti va katalogdagi bir xil nomli Telegram collectible biriktirildi.</p>
      </section>
      <section className={styles.grid} aria-label="Yangi caselar">
        {cases.map((item,index)=>(
          <article key={item.slug} className={styles.card} style={{'--accent':item.color}}>
            <div className={styles.art}>
              <span className={styles.index}>0{index+1}</span>
              <img src={`/cases/${item.slug}.svg`} alt={`${item.name} grafik muqovasi`} width="620" height="470" loading={index<2?'eager':'lazy'} decoding="async"/>
              <span className={styles.tag}>{item.label}</span>
            </div>
            <div className={styles.body}>
              <strong>{item.name}</strong>
              <p>{item.text}</p>
              <div className={styles.meta}><span>🎁 {item.gift}</span><span>{item.price.toLocaleString('en-US')} ⭐</span></div>
            </div>
            <div className={styles.foot}><span>5 Stars reward + 1 collectible</span><span className={styles.draft}>DRAFT</span></div>
          </article>
        ))}
      </section>
      <footer className={styles.footer}>
        <p><strong>Nega DRAFT?</strong> Katalogdagi NFT’lar foydalanuvchiga topshirishga tayyorligi hali tasdiqlanmagan. Yangi case’lar admin bazasida saqlangan, ammo pullik ochish hozircha yoqilmagan.</p>
        <Link href="/admin">Admin panelda ko‘rish →</Link>
      </footer>
    </main>
  );
}