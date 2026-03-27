import { db, chaletsTable } from "@workspace/db";

const chalets = [
  {
    nameAr: "شاليه النخيل الذهبي",
    descriptionAr:
      "شاليه فاخر يتميز بتصميم عربي أصيل، يضم حديقة خضراء واسعة ومسبح خاص ومنطقة شواء مجهزة. يقع في قلب بريدة مع إطلالة رائعة على النخيل. مناسب للعائلات الكريمة التي تبحث عن الراحة والاسترخاء.",
    location: "بريدة",
    pricePerNight: "450",
    maxGuests: 20,
    bedrooms: 5,
    amenities: [
      "مسبح خاص",
      "حديقة",
      "شواء",
      "واي فاي",
      "مكيف",
      "مطبخ مجهز",
      "موقف سيارات",
      "ملعب أطفال",
    ],
    photos: [
      "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800&q=80",
      "https://images.unsplash.com/photo-1582268611958-ebfd161ef9cf?w=800&q=80",
      "https://images.unsplash.com/photo-1613977257363-707ba9348227?w=800&q=80",
    ],
    whatsappNumber: "966501234501",
  },
  {
    nameAr: "شاليه الوادي الأخضر",
    descriptionAr:
      "استمتع بإقامة هادئة في شاليه الوادي الأخضر، المحاط بالطبيعة الخلابة في عنيزة. يوفر الشاليه غرف نوم واسعة ومطبخاً مجهزاً وجلسات خارجية مريحة. تجربة لا تُنسى للعائلات الكبيرة.",
    location: "عنيزة",
    pricePerNight: "380",
    maxGuests: 15,
    bedrooms: 4,
    amenities: [
      "حديقة",
      "شواء",
      "واي فاي",
      "مكيف",
      "مطبخ مجهز",
      "موقف سيارات",
      "جلسات خارجية",
    ],
    photos: [
      "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&q=80",
      "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800&q=80",
      "https://images.unsplash.com/photo-1605146769289-440113cc3d00?w=800&q=80",
    ],
    whatsappNumber: "966501234502",
  },
  {
    nameAr: "فيلا الأمير الهادئة",
    descriptionAr:
      "فيلا راقية بتصميم عصري في مدينة الرس، توفر أجواء هادئة بعيداً عن صخب المدينة. تتميز بمسبح كبير وحديقة واسعة وجلسات مجهزة لأوقات الاسترخاء والترفيه.",
    location: "الرس",
    pricePerNight: "520",
    maxGuests: 25,
    bedrooms: 6,
    amenities: [
      "مسبح خاص",
      "حديقة",
      "شواء",
      "واي فاي",
      "مكيف",
      "مطبخ مجهز",
      "موقف سيارات",
      "مجلس",
      "غرفة ألعاب",
    ],
    photos: [
      "https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=800&q=80",
      "https://images.unsplash.com/photo-1583608205776-bfd35f0d9f83?w=800&q=80",
      "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=800&q=80",
    ],
    whatsappNumber: "966501234503",
  },
  {
    nameAr: "شاليه الصحراء الفاخر",
    descriptionAr:
      "تجربة فريدة من نوعها في شاليه الصحراء الفاخر ببريدة. يجمع بين الفخامة والطابع البدوي الأصيل، مع خيمة تراثية وجلسات تحت النجوم ومطبخ لإعداد وجبات شهية.",
    location: "بريدة",
    pricePerNight: "600",
    maxGuests: 30,
    bedrooms: 7,
    amenities: [
      "خيمة تراثية",
      "جلسات خارجية",
      "شواء",
      "واي فاي",
      "مكيف",
      "مطبخ مجهز",
      "موقف سيارات",
      "مسبح",
      "ملاعب رياضية",
    ],
    photos: [
      "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80",
      "https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=800&q=80",
      "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800&q=80",
    ],
    whatsappNumber: "966501234504",
  },
  {
    nameAr: "شاليه نجمة الشمال",
    descriptionAr:
      "شاليه مميز في عنيزة يناسب المجموعات الصغيرة والعائلات، يوفر أجواء دافئة ومريحة مع جميع المرافق اللازمة لقضاء إجازة ممتعة بأسعار معقولة.",
    location: "عنيزة",
    pricePerNight: "280",
    maxGuests: 10,
    bedrooms: 3,
    amenities: [
      "حديقة",
      "شواء",
      "واي فاي",
      "مكيف",
      "مطبخ مجهز",
      "موقف سيارات",
    ],
    photos: [
      "https://images.unsplash.com/photo-1572120360610-d971b9d7767c?w=800&q=80",
      "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800&q=80",
    ],
    whatsappNumber: "966501234505",
  },
  {
    nameAr: "قصر الخبراء الريفي",
    descriptionAr:
      "قصر ريفي فخم في مدينة الخبراء يتسع لعائلات كبيرة ومجموعات. يضم مزرعة صغيرة وحديقة غناء وبيئة طبيعية هادئة بعيداً عن ضوضاء المدينة.",
    location: "الخبراء",
    pricePerNight: "420",
    maxGuests: 18,
    bedrooms: 5,
    amenities: [
      "مزرعة",
      "حديقة",
      "شواء",
      "واي فاي",
      "مكيف",
      "مطبخ مجهز",
      "موقف سيارات",
      "جلسات خارجية",
      "ملعب أطفال",
    ],
    photos: [
      "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&q=80",
      "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80",
      "https://images.unsplash.com/photo-1600573472592-401b489a3cdc?w=800&q=80",
    ],
    whatsappNumber: "966501234506",
  },
  {
    nameAr: "شاليه البستان الجميل",
    descriptionAr:
      "شاليه عائلي جميل في بريدة بتصميم هادئ وأجواء منعشة. يحيط به بستان جميل مع أشجار مثمرة وزهور ملونة، مما يوفر بيئة مثالية للاسترخاء والتجديد.",
    location: "بريدة",
    pricePerNight: "340",
    maxGuests: 12,
    bedrooms: 3,
    amenities: [
      "بستان",
      "حديقة",
      "شواء",
      "واي فاي",
      "مكيف",
      "مطبخ مجهز",
      "موقف سيارات",
    ],
    photos: [
      "https://images.unsplash.com/photo-1602343168117-bb8ffe3e2e9f?w=800&q=80",
      "https://images.unsplash.com/photo-1615529328331-f8917597711f?w=800&q=80",
    ],
    whatsappNumber: "966501234507",
  },
  {
    nameAr: "شاليه السلام المميز",
    descriptionAr:
      "شاليه السلام المميز في الرس، وجهتك المثالية للاسترخاء والراحة. يتميز بمسبح حديث وملاعب رياضية متنوعة وغرف نوم فاخرة تضمن لك ولعائلتك أجمل الذكريات.",
    location: "الرس",
    pricePerNight: "480",
    maxGuests: 22,
    bedrooms: 6,
    amenities: [
      "مسبح خاص",
      "ملاعب رياضية",
      "حديقة",
      "شواء",
      "واي فاي",
      "مكيف",
      "مطبخ مجهز",
      "موقف سيارات",
    ],
    photos: [
      "https://images.unsplash.com/photo-1549638441-b787d2e11f14?w=800&q=80",
      "https://images.unsplash.com/photo-1575517111478-7f6afd0973db?w=800&q=80",
      "https://images.unsplash.com/photo-1601918774946-25832a4be0d6?w=800&q=80",
    ],
    whatsappNumber: "966501234508",
  },
];

async function seed() {
  console.log("Seeding chalets...");

  await db.delete(chaletsTable);

  for (const chalet of chalets) {
    await db.insert(chaletsTable).values(chalet);
  }

  console.log(`Seeded ${chalets.length} chalets successfully.`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
