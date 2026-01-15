"use client";

import Image from "next/image";

export default function Hero() {
  return (
    <section className="relative w-full min-h-[70vh] flex items-center justify-center text-center bg-gold-blue-gradient overflow-hidden">

      {/* Islamic Pattern Overlay */}
      <div className="absolute inset-0 opacity-15 pointer-events-none">
        <Image 
          src="/pattern-islamic.png"
          alt="Islamic Pattern"
          fill
          className="object-cover mix-blend-soft-light"
        />
      </div>

      {/* Content */}
      <div className="relative z-20 max-w-3xl px-6 text-white">

        <h1 className="text-4xl md:text-6xl font-extrabold drop-shadow-xl leading-snug">
          <span className="text-gold">بيت الجزيرة</span>
          <br />
          منصة عقارية ذكية
        </h1>

        <p className="mt-4 text-lg md:text-xl text-cream">
          ابحث عن منزلك المثالي في مكة – المدينة – جدة – الطائف – الرياض
        </p>

        <div className="mt-8 flex items-center justify-center gap-4 flex-wrap">
          <input 
            type="text"
            placeholder="ابحث عن مدينة، حي، أو نوع العقار..."
            className="w-full md:w-[350px] h-14 px-4 rounded-xl text-royalblue bg-white shadow-lg outline-none border border-gold"
          />

          <button className="h-14 px-6 bg-gold text-royalblue rounded-xl shadow-gold text-xl font-extrabold hover:bg-lightgold transition-all">
            بحث
          </button>
        </div>
      </div>

      {/* Islamic Corner Ornament */}
      <div className="absolute top-4 right-4 opacity-60">
        <Image 
          src="/corner.png"
          alt="Decor"
          width={120}
          height={120}
        />
      </div>

    </section>
  );
}
