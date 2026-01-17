const db = require('../db');

const gccCitiesData = [
  // Saudi Arabia (133 cities)
  {"name_ar":"مكة المكرمة","name_en":"Makkah","region_ar":"منطقة مكة المكرمة","region_en":"Makkah Region","is_popular":true,"lat":21.3891,"lng":39.8579,"country_code":"SA"},
  {"name_ar":"المدينة المنورة","name_en":"Madinah","region_ar":"منطقة المدينة المنورة","region_en":"Madinah Region","is_popular":true,"lat":24.5247,"lng":39.5692,"country_code":"SA"},
  {"name_ar":"جدة","name_en":"Jeddah","region_ar":"منطقة مكة المكرمة","region_en":"Makkah Region","is_popular":true,"lat":21.4858,"lng":39.1925,"country_code":"SA"},
  {"name_ar":"الرياض","name_en":"Riyadh","region_ar":"منطقة الرياض","region_en":"Riyadh Region","is_popular":true,"lat":24.7136,"lng":46.6753,"country_code":"SA"},
  {"name_ar":"الطائف","name_en":"Taif","region_ar":"منطقة مكة المكرمة","region_en":"Makkah Region","is_popular":true,"lat":21.2703,"lng":40.4158,"country_code":"SA"},
  {"name_ar":"الدمام","name_en":"Dammam","region_ar":"المنطقة الشرقية","region_en":"Eastern Province","is_popular":true,"lat":26.4207,"lng":50.0888,"country_code":"SA"},
  {"name_ar":"الخبر","name_en":"Khobar","region_ar":"المنطقة الشرقية","region_en":"Eastern Province","is_popular":true,"lat":26.2172,"lng":50.1971,"country_code":"SA"},
  {"name_ar":"أبها","name_en":"Abha","region_ar":"منطقة عسير","region_en":"Asir Region","is_popular":true,"lat":18.2164,"lng":42.5053,"country_code":"SA"},
  {"name_ar":"أبو عريش","name_en":"Abu Arish","region_ar":"منطقة جازان","region_en":"Jazan Region","is_popular":false,"lat":16.9694,"lng":42.8319,"country_code":"SA"},
  {"name_ar":"أحد المسارحة","name_en":"Ahad Al Masarihah","region_ar":"منطقة جازان","region_en":"Jazan Region","is_popular":false,"lat":16.7167,"lng":43.0667,"country_code":"SA"},
  {"name_ar":"أحد رفيدة","name_en":"Ahad Rufaydah","region_ar":"منطقة عسير","region_en":"Asir Region","is_popular":false,"lat":18.0667,"lng":42.9,"country_code":"SA"},
  {"name_ar":"أضم","name_en":"Adham","region_ar":"منطقة مكة المكرمة","region_en":"Makkah Region","is_popular":false,"lat":20.55,"lng":40.45,"country_code":"SA"},
  {"name_ar":"أملج","name_en":"Umluj","region_ar":"منطقة تبوك","region_en":"Tabuk Region","is_popular":false,"lat":25.0206,"lng":37.2667,"country_code":"SA"},
  {"name_ar":"الأحساء","name_en":"Al Ahsa","region_ar":"المنطقة الشرقية","region_en":"Eastern Province","is_popular":true,"lat":25.3648,"lng":49.5837,"country_code":"SA"},
  {"name_ar":"الأفلاج","name_en":"Al Aflaj","region_ar":"منطقة الرياض","region_en":"Riyadh Region","is_popular":false,"lat":22.2833,"lng":46.7333,"country_code":"SA"},
  {"name_ar":"الباحة","name_en":"Al Baha","region_ar":"منطقة الباحة","region_en":"Al Baha Region","is_popular":true,"lat":20.0129,"lng":41.4677,"country_code":"SA"},
  {"name_ar":"البدائع","name_en":"Al Badai","region_ar":"منطقة القصيم","region_en":"Qassim Region","is_popular":false,"lat":26.0667,"lng":43.7667,"country_code":"SA"},
  {"name_ar":"البدع","name_en":"Al Bada","region_ar":"منطقة تبوك","region_en":"Tabuk Region","is_popular":false,"lat":28.5167,"lng":35.0,"country_code":"SA"},
  {"name_ar":"البرك","name_en":"Al Birk","region_ar":"منطقة عسير","region_en":"Asir Region","is_popular":false,"lat":18.2167,"lng":41.55,"country_code":"SA"},
  {"name_ar":"البكيرية","name_en":"Al Bukayriyah","region_ar":"منطقة القصيم","region_en":"Qassim Region","is_popular":false,"lat":26.2833,"lng":43.6667,"country_code":"SA"},
  {"name_ar":"الجبيل","name_en":"Jubail","region_ar":"المنطقة الشرقية","region_en":"Eastern Province","is_popular":true,"lat":27.0174,"lng":49.6225,"country_code":"SA"},
  {"name_ar":"الجموم","name_en":"Al Jumum","region_ar":"منطقة مكة المكرمة","region_en":"Makkah Region","is_popular":false,"lat":21.6167,"lng":39.7,"country_code":"SA"},
  {"name_ar":"الحريق","name_en":"Al Hariq","region_ar":"منطقة الرياض","region_en":"Riyadh Region","is_popular":false,"lat":23.9,"lng":46.4333,"country_code":"SA"},
  {"name_ar":"الخرج","name_en":"Al Kharj","region_ar":"منطقة الرياض","region_en":"Riyadh Region","is_popular":true,"lat":24.1556,"lng":47.3117,"country_code":"SA"},
  {"name_ar":"الخرمة","name_en":"Al Khurma","region_ar":"منطقة مكة المكرمة","region_en":"Makkah Region","is_popular":false,"lat":21.9167,"lng":42.0833,"country_code":"SA"},
  {"name_ar":"الخفجي","name_en":"Khafji","region_ar":"المنطقة الشرقية","region_en":"Eastern Province","is_popular":false,"lat":28.4333,"lng":48.4833,"country_code":"SA"},
  {"name_ar":"الدرب","name_en":"Al Darb","region_ar":"منطقة جازان","region_en":"Jazan Region","is_popular":false,"lat":17.7167,"lng":42.25,"country_code":"SA"},
  {"name_ar":"الدرعية","name_en":"Diriyah","region_ar":"منطقة الرياض","region_en":"Riyadh Region","is_popular":true,"lat":24.7333,"lng":46.5667,"country_code":"SA"},
  {"name_ar":"الدوادمي","name_en":"Dawadmi","region_ar":"منطقة الرياض","region_en":"Riyadh Region","is_popular":false,"lat":24.5,"lng":44.3833,"country_code":"SA"},
  {"name_ar":"الذهبان","name_en":"Al Dhahban","region_ar":"منطقة مكة المكرمة","region_en":"Makkah Region","is_popular":false,"lat":21.9833,"lng":39.1167,"country_code":"SA"},
  {"name_ar":"الرس","name_en":"Al Rass","region_ar":"منطقة القصيم","region_en":"Qassim Region","is_popular":false,"lat":25.8667,"lng":43.5,"country_code":"SA"},
  {"name_ar":"الزلفي","name_en":"Zulfi","region_ar":"منطقة الرياض","region_en":"Riyadh Region","is_popular":false,"lat":26.3,"lng":44.8,"country_code":"SA"},
  {"name_ar":"السليل","name_en":"As Sulayyil","region_ar":"منطقة الرياض","region_en":"Riyadh Region","is_popular":false,"lat":20.4667,"lng":45.5833,"country_code":"SA"},
  {"name_ar":"الشرقية","name_en":"Eastern Province","region_ar":"المنطقة الشرقية","region_en":"Eastern Province","is_popular":false,"lat":25.0,"lng":49.0,"country_code":"SA"},
  {"name_ar":"الشفا","name_en":"Al Shafa","region_ar":"منطقة مكة المكرمة","region_en":"Makkah Region","is_popular":false,"lat":21.0667,"lng":40.3167,"country_code":"SA"},
  {"name_ar":"الشنان","name_en":"Al Shinan","region_ar":"منطقة حائل","region_en":"Hail Region","is_popular":false,"lat":27.7333,"lng":41.7167,"country_code":"SA"},
  {"name_ar":"الطوال","name_en":"Al Tuwal","region_ar":"منطقة جازان","region_en":"Jazan Region","is_popular":false,"lat":16.8333,"lng":43.0667,"country_code":"SA"},
  {"name_ar":"الظهران","name_en":"Dhahran","region_ar":"المنطقة الشرقية","region_en":"Eastern Province","is_popular":true,"lat":26.2667,"lng":50.15,"country_code":"SA"},
  {"name_ar":"العارضة","name_en":"Al Aridhah","region_ar":"منطقة جازان","region_en":"Jazan Region","is_popular":false,"lat":17.1333,"lng":42.8833,"country_code":"SA"},
  {"name_ar":"العرضيات","name_en":"Al Ardhiyyat","region_ar":"منطقة مكة المكرمة","region_en":"Makkah Region","is_popular":false,"lat":19.4667,"lng":42.5833,"country_code":"SA"},
  {"name_ar":"العلا","name_en":"AlUla","region_ar":"منطقة المدينة المنورة","region_en":"Madinah Region","is_popular":true,"lat":26.6167,"lng":37.9167,"country_code":"SA"},
  {"name_ar":"العويقيلة","name_en":"Al Uwayqilah","region_ar":"منطقة الحدود الشمالية","region_en":"Northern Borders Region","is_popular":false,"lat":30.5833,"lng":42.3333,"country_code":"SA"},
  {"name_ar":"الغزالة","name_en":"Al Ghazalah","region_ar":"منطقة حائل","region_en":"Hail Region","is_popular":false,"lat":27.7167,"lng":41.5167,"country_code":"SA"},
  {"name_ar":"القريات","name_en":"Qurayyat","region_ar":"منطقة الجوف","region_en":"Al Jawf Region","is_popular":false,"lat":31.3333,"lng":37.35,"country_code":"SA"},
  {"name_ar":"القصيم","name_en":"Qassim","region_ar":"منطقة القصيم","region_en":"Qassim Region","is_popular":true,"lat":26.3333,"lng":43.9667,"country_code":"SA"},
  {"name_ar":"القنفذة","name_en":"Al Qunfudhah","region_ar":"منطقة مكة المكرمة","region_en":"Makkah Region","is_popular":false,"lat":19.1333,"lng":41.0833,"country_code":"SA"},
  {"name_ar":"القويعية","name_en":"Al Quway'iyah","region_ar":"منطقة الرياض","region_en":"Riyadh Region","is_popular":false,"lat":24.0333,"lng":45.2833,"country_code":"SA"},
  {"name_ar":"الكامل","name_en":"Al Kamil","region_ar":"منطقة مكة المكرمة","region_en":"Makkah Region","is_popular":false,"lat":21.55,"lng":39.8167,"country_code":"SA"},
  {"name_ar":"الليث","name_en":"Al Lith","region_ar":"منطقة مكة المكرمة","region_en":"Makkah Region","is_popular":false,"lat":20.15,"lng":40.2667,"country_code":"SA"},
  {"name_ar":"المجاردة","name_en":"Al Majardah","region_ar":"منطقة عسير","region_en":"Asir Region","is_popular":false,"lat":19.0833,"lng":41.9,"country_code":"SA"},
  {"name_ar":"المجمعة","name_en":"Al Majma'ah","region_ar":"منطقة الرياض","region_en":"Riyadh Region","is_popular":false,"lat":25.9,"lng":45.35,"country_code":"SA"},
  {"name_ar":"المخواة","name_en":"Al Makhwah","region_ar":"منطقة الباحة","region_en":"Al Baha Region","is_popular":false,"lat":19.7833,"lng":41.4333,"country_code":"SA"},
  {"name_ar":"المذنب","name_en":"Al Mithnab","region_ar":"منطقة القصيم","region_en":"Qassim Region","is_popular":false,"lat":25.9,"lng":44.25,"country_code":"SA"},
  {"name_ar":"المزاحمية","name_en":"Al Muzahimiyah","region_ar":"منطقة الرياض","region_en":"Riyadh Region","is_popular":false,"lat":24.4667,"lng":46.2667,"country_code":"SA"},
  {"name_ar":"المظيلف","name_en":"Al Muzaylif","region_ar":"منطقة مكة المكرمة","region_en":"Makkah Region","is_popular":false,"lat":21.0667,"lng":40.6333,"country_code":"SA"},
  {"name_ar":"الموية","name_en":"Al Muwayh","region_ar":"منطقة مكة المكرمة","region_en":"Makkah Region","is_popular":false,"lat":22.4333,"lng":41.75,"country_code":"SA"},
  {"name_ar":"النعيرية","name_en":"Al Nairyah","region_ar":"المنطقة الشرقية","region_en":"Eastern Province","is_popular":false,"lat":27.4833,"lng":48.4833,"country_code":"SA"},
  {"name_ar":"النماص","name_en":"An Namas","region_ar":"منطقة عسير","region_en":"Asir Region","is_popular":false,"lat":19.1167,"lng":42.1167,"country_code":"SA"},
  {"name_ar":"الهدا","name_en":"Al Hada","region_ar":"منطقة مكة المكرمة","region_en":"Makkah Region","is_popular":true,"lat":21.3667,"lng":40.3,"country_code":"SA"},
  {"name_ar":"الوجه","name_en":"Al Wajh","region_ar":"منطقة تبوك","region_en":"Tabuk Region","is_popular":false,"lat":26.2333,"lng":36.4667,"country_code":"SA"},
  {"name_ar":"بدر","name_en":"Badr","region_ar":"منطقة المدينة المنورة","region_en":"Madinah Region","is_popular":false,"lat":23.7833,"lng":38.8,"country_code":"SA"},
  {"name_ar":"بريدة","name_en":"Buraydah","region_ar":"منطقة القصيم","region_en":"Qassim Region","is_popular":true,"lat":26.3286,"lng":43.975,"country_code":"SA"},
  {"name_ar":"بقعاء","name_en":"Buqaa","region_ar":"منطقة حائل","region_en":"Hail Region","is_popular":false,"lat":27.7,"lng":41.5,"country_code":"SA"},
  {"name_ar":"بيش","name_en":"Baysh","region_ar":"منطقة جازان","region_en":"Jazan Region","is_popular":false,"lat":17.4,"lng":42.6,"country_code":"SA"},
  {"name_ar":"بيشة","name_en":"Bishah","region_ar":"منطقة عسير","region_en":"Asir Region","is_popular":false,"lat":20.0,"lng":42.6,"country_code":"SA"},
  {"name_ar":"تبوك","name_en":"Tabuk","region_ar":"منطقة تبوك","region_en":"Tabuk Region","is_popular":true,"lat":28.3838,"lng":36.5659,"country_code":"SA"},
  {"name_ar":"تثليث","name_en":"Tathlith","region_ar":"منطقة عسير","region_en":"Asir Region","is_popular":false,"lat":19.55,"lng":43.5167,"country_code":"SA"},
  {"name_ar":"تربة","name_en":"Turbah","region_ar":"منطقة مكة المكرمة","region_en":"Makkah Region","is_popular":false,"lat":21.2333,"lng":41.6667,"country_code":"SA"},
  {"name_ar":"تيماء","name_en":"Tayma","region_ar":"منطقة تبوك","region_en":"Tabuk Region","is_popular":false,"lat":27.6333,"lng":38.5333,"country_code":"SA"},
  {"name_ar":"ثادق","name_en":"Thadiq","region_ar":"منطقة الرياض","region_en":"Riyadh Region","is_popular":false,"lat":25.3,"lng":45.8667,"country_code":"SA"},
  {"name_ar":"جازان","name_en":"Jazan","region_ar":"منطقة جازان","region_en":"Jazan Region","is_popular":true,"lat":16.8892,"lng":42.5611,"country_code":"SA"},
  {"name_ar":"حائل","name_en":"Hail","region_ar":"منطقة حائل","region_en":"Hail Region","is_popular":true,"lat":27.5219,"lng":41.6907,"country_code":"SA"},
  {"name_ar":"حبونا","name_en":"Habuna","region_ar":"منطقة نجران","region_en":"Najran Region","is_popular":false,"lat":17.85,"lng":44.2333,"country_code":"SA"},
  {"name_ar":"حريملاء","name_en":"Huraymila","region_ar":"منطقة الرياض","region_en":"Riyadh Region","is_popular":false,"lat":25.1333,"lng":46.1333,"country_code":"SA"},
  {"name_ar":"حفر الباطن","name_en":"Hafar Al Batin","region_ar":"المنطقة الشرقية","region_en":"Eastern Province","is_popular":true,"lat":28.4333,"lng":45.9667,"country_code":"SA"},
  {"name_ar":"حقل","name_en":"Haql","region_ar":"منطقة تبوك","region_en":"Tabuk Region","is_popular":false,"lat":29.2833,"lng":34.95,"country_code":"SA"},
  {"name_ar":"حوطة بني تميم","name_en":"Hawtat Bani Tamim","region_ar":"منطقة الرياض","region_en":"Riyadh Region","is_popular":false,"lat":23.5,"lng":46.85,"country_code":"SA"},
  {"name_ar":"خميس مشيط","name_en":"Khamis Mushait","region_ar":"منطقة عسير","region_en":"Asir Region","is_popular":true,"lat":18.3,"lng":42.7333,"country_code":"SA"},
  {"name_ar":"خيبر","name_en":"Khaybar","region_ar":"منطقة المدينة المنورة","region_en":"Madinah Region","is_popular":false,"lat":25.7,"lng":39.3,"country_code":"SA"},
  {"name_ar":"دومة الجندل","name_en":"Dawmat Al Jandal","region_ar":"منطقة الجوف","region_en":"Al Jawf Region","is_popular":false,"lat":29.8167,"lng":39.8667,"country_code":"SA"},
  {"name_ar":"رابغ","name_en":"Rabigh","region_ar":"منطقة مكة المكرمة","region_en":"Makkah Region","is_popular":false,"lat":22.7833,"lng":39.0333,"country_code":"SA"},
  {"name_ar":"رأس تنورة","name_en":"Ras Tanura","region_ar":"المنطقة الشرقية","region_en":"Eastern Province","is_popular":false,"lat":26.6667,"lng":50.0333,"country_code":"SA"},
  {"name_ar":"رفحاء","name_en":"Rafha","region_ar":"منطقة الحدود الشمالية","region_en":"Northern Borders Region","is_popular":false,"lat":29.6333,"lng":43.5,"country_code":"SA"},
  {"name_ar":"رنية","name_en":"Raniyah","region_ar":"منطقة مكة المكرمة","region_en":"Makkah Region","is_popular":false,"lat":21.25,"lng":42.85,"country_code":"SA"},
  {"name_ar":"رياض الخبراء","name_en":"Riyadh Al Khabra","region_ar":"منطقة القصيم","region_en":"Qassim Region","is_popular":false,"lat":25.7333,"lng":43.55,"country_code":"SA"},
  {"name_ar":"سبت العلاية","name_en":"Sabt Al Alayah","region_ar":"منطقة عسير","region_en":"Asir Region","is_popular":false,"lat":19.3333,"lng":42.1667,"country_code":"SA"},
  {"name_ar":"سراة عبيدة","name_en":"Sarat Abidah","region_ar":"منطقة عسير","region_en":"Asir Region","is_popular":false,"lat":18.2167,"lng":43.15,"country_code":"SA"},
  {"name_ar":"سكاكا","name_en":"Sakaka","region_ar":"منطقة الجوف","region_en":"Al Jawf Region","is_popular":true,"lat":29.9697,"lng":40.2,"country_code":"SA"},
  {"name_ar":"شرورة","name_en":"Sharurah","region_ar":"منطقة نجران","region_en":"Najran Region","is_popular":false,"lat":17.4833,"lng":47.1167,"country_code":"SA"},
  {"name_ar":"شقراء","name_en":"Shaqra","region_ar":"منطقة الرياض","region_en":"Riyadh Region","is_popular":false,"lat":25.25,"lng":45.25,"country_code":"SA"},
  {"name_ar":"صامطة","name_en":"Samtah","region_ar":"منطقة جازان","region_en":"Jazan Region","is_popular":false,"lat":16.6,"lng":42.95,"country_code":"SA"},
  {"name_ar":"صبيا","name_en":"Sabya","region_ar":"منطقة جازان","region_en":"Jazan Region","is_popular":false,"lat":17.15,"lng":42.6167,"country_code":"SA"},
  {"name_ar":"صفوى","name_en":"Safwa","region_ar":"المنطقة الشرقية","region_en":"Eastern Province","is_popular":false,"lat":26.65,"lng":49.95,"country_code":"SA"},
  {"name_ar":"ضباء","name_en":"Duba","region_ar":"منطقة تبوك","region_en":"Tabuk Region","is_popular":false,"lat":27.35,"lng":35.6833,"country_code":"SA"},
  {"name_ar":"ضرما","name_en":"Durma","region_ar":"منطقة الرياض","region_en":"Riyadh Region","is_popular":false,"lat":24.5833,"lng":45.95,"country_code":"SA"},
  {"name_ar":"ضمد","name_en":"Damad","region_ar":"منطقة جازان","region_en":"Jazan Region","is_popular":false,"lat":17.0667,"lng":42.8833,"country_code":"SA"},
  {"name_ar":"طبرجل","name_en":"Tabarjal","region_ar":"منطقة الجوف","region_en":"Al Jawf Region","is_popular":false,"lat":30.5,"lng":38.2333,"country_code":"SA"},
  {"name_ar":"طريف","name_en":"Turaif","region_ar":"منطقة الحدود الشمالية","region_en":"Northern Borders Region","is_popular":false,"lat":31.6833,"lng":38.6667,"country_code":"SA"},
  {"name_ar":"عرعر","name_en":"Arar","region_ar":"منطقة الحدود الشمالية","region_en":"Northern Borders Region","is_popular":true,"lat":30.9833,"lng":41.0167,"country_code":"SA"},
  {"name_ar":"عفيف","name_en":"Afif","region_ar":"منطقة الرياض","region_en":"Riyadh Region","is_popular":false,"lat":23.9167,"lng":42.95,"country_code":"SA"},
  {"name_ar":"عنيزة","name_en":"Unayzah","region_ar":"منطقة القصيم","region_en":"Qassim Region","is_popular":true,"lat":26.0833,"lng":43.9833,"country_code":"SA"},
  {"name_ar":"فرسان","name_en":"Farasan","region_ar":"منطقة جازان","region_en":"Jazan Region","is_popular":false,"lat":16.7,"lng":42.1167,"country_code":"SA"},
  {"name_ar":"فيفا","name_en":"Fifa","region_ar":"منطقة جازان","region_en":"Jazan Region","is_popular":false,"lat":17.25,"lng":43.1,"country_code":"SA"},
  {"name_ar":"قلوة","name_en":"Qilwah","region_ar":"منطقة الباحة","region_en":"Al Baha Region","is_popular":false,"lat":19.6667,"lng":41.4,"country_code":"SA"},
  {"name_ar":"محايل","name_en":"Muhayil","region_ar":"منطقة عسير","region_en":"Asir Region","is_popular":false,"lat":18.55,"lng":42.0333,"country_code":"SA"},
  {"name_ar":"ملهم","name_en":"Mulham","region_ar":"منطقة الرياض","region_en":"Riyadh Region","is_popular":false,"lat":25.0167,"lng":46.0333,"country_code":"SA"},
  {"name_ar":"نجران","name_en":"Najran","region_ar":"منطقة نجران","region_en":"Najran Region","is_popular":true,"lat":17.4917,"lng":44.1322,"country_code":"SA"},
  {"name_ar":"وادي الدواسر","name_en":"Wadi Al Dawasir","region_ar":"منطقة الرياض","region_en":"Riyadh Region","is_popular":false,"lat":20.5,"lng":44.8333,"country_code":"SA"},
  {"name_ar":"ينبع","name_en":"Yanbu","region_ar":"منطقة المدينة المنورة","region_en":"Madinah Region","is_popular":true,"lat":24.0889,"lng":38.0581,"country_code":"SA"},
  {"name_ar":"نيوم","name_en":"NEOM","region_ar":"منطقة تبوك","region_en":"Tabuk Region","is_popular":true,"lat":28.0,"lng":35.0,"country_code":"SA"},
  {"name_ar":"القدية","name_en":"Qiddiya","region_ar":"منطقة الرياض","region_en":"Riyadh Region","is_popular":true,"lat":24.5,"lng":46.35,"country_code":"SA"},
  {"name_ar":"البحر الأحمر","name_en":"Red Sea Project","region_ar":"منطقة تبوك","region_en":"Tabuk Region","is_popular":true,"lat":26.5,"lng":36.0,"country_code":"SA"},
  {"name_ar":"أمالا","name_en":"Amaala","region_ar":"منطقة تبوك","region_en":"Tabuk Region","is_popular":true,"lat":27.0,"lng":35.5,"country_code":"SA"},
  {"name_ar":"الرين","name_en":"Al Rayn","region_ar":"منطقة الرياض","region_en":"Riyadh Region","is_popular":false,"lat":23.5167,"lng":45.5,"country_code":"SA"},
  {"name_ar":"المضيلف","name_en":"Al Mudaylif","region_ar":"منطقة مكة المكرمة","region_en":"Makkah Region","is_popular":false,"lat":21.1,"lng":40.6,"country_code":"SA"},
  {"name_ar":"العديد","name_en":"Al Adadeed","region_ar":"منطقة الرياض","region_en":"Riyadh Region","is_popular":false,"lat":24.0,"lng":46.0,"country_code":"SA"},
  {"name_ar":"القريع","name_en":"Al Qari","region_ar":"منطقة عسير","region_en":"Asir Region","is_popular":false,"lat":19.0,"lng":42.0,"country_code":"SA"},
  {"name_ar":"العرين","name_en":"Al Ureen","region_ar":"منطقة الباحة","region_en":"Al Baha Region","is_popular":false,"lat":19.9,"lng":41.6,"country_code":"SA"},
  {"name_ar":"الشوقية","name_en":"Al Shawqiyyah","region_ar":"منطقة مكة المكرمة","region_en":"Makkah Region","is_popular":false,"lat":21.4167,"lng":39.85,"country_code":"SA"},
  {"name_ar":"الشميسي","name_en":"Al Shumaisi","region_ar":"منطقة الرياض","region_en":"Riyadh Region","is_popular":false,"lat":24.6667,"lng":46.65,"country_code":"SA"},
  {"name_ar":"ضحيان","name_en":"Dhahyan","region_ar":"منطقة مكة المكرمة","region_en":"Makkah Region","is_popular":false,"lat":21.3,"lng":39.8,"country_code":"SA"},
  {"name_ar":"جلاجل","name_en":"Jalajil","region_ar":"منطقة الرياض","region_en":"Riyadh Region","is_popular":false,"lat":25.0333,"lng":45.7667,"country_code":"SA"},
  {"name_ar":"المجردة","name_en":"Al Mujardah","region_ar":"منطقة مكة المكرمة","region_en":"Makkah Region","is_popular":false,"lat":21.0,"lng":40.0,"country_code":"SA"},
  {"name_ar":"القيصومة","name_en":"Al Qaysumah","region_ar":"منطقة الحدود الشمالية","region_en":"Northern Borders Region","is_popular":false,"lat":28.3333,"lng":46.1167,"country_code":"SA"},
  {"name_ar":"عقلة الصقور","name_en":"Uqlat Al Suqur","region_ar":"منطقة القصيم","region_en":"Qassim Region","is_popular":false,"lat":25.8667,"lng":42.15,"country_code":"SA"},
  {"name_ar":"بيض الجبل","name_en":"Baydh Al Jabal","region_ar":"منطقة الرياض","region_en":"Riyadh Region","is_popular":false,"lat":24.0,"lng":46.0,"country_code":"SA"},
  {"name_ar":"المستوى","name_en":"Al Mustawah","region_ar":"منطقة مكة المكرمة","region_en":"Makkah Region","is_popular":false,"lat":21.0,"lng":40.0,"country_code":"SA"},
  {"name_ar":"ثار","name_en":"Thar","region_ar":"منطقة مكة المكرمة","region_en":"Makkah Region","is_popular":false,"lat":21.3333,"lng":40.2,"country_code":"SA"},
  {"name_ar":"العقيق","name_en":"Al Aqiq","region_ar":"منطقة الباحة","region_en":"Al Baha Region","is_popular":false,"lat":20.2667,"lng":41.6333,"country_code":"SA"},

  // UAE (24 cities)
  {"name_ar":"دبي","name_en":"Dubai","region_ar":"إمارة دبي","region_en":"Dubai","is_popular":true,"lat":25.2048,"lng":55.2708,"country_code":"AE"},
  {"name_ar":"أبو ظبي","name_en":"Abu Dhabi","region_ar":"إمارة أبو ظبي","region_en":"Abu Dhabi","is_popular":true,"lat":24.4539,"lng":54.3773,"country_code":"AE"},
  {"name_ar":"الشارقة","name_en":"Sharjah","region_ar":"إمارة الشارقة","region_en":"Sharjah","is_popular":true,"lat":25.3573,"lng":55.4033,"country_code":"AE"},
  {"name_ar":"العين","name_en":"Al Ain","region_ar":"إمارة أبو ظبي","region_en":"Abu Dhabi","is_popular":true,"lat":24.2075,"lng":55.7447,"country_code":"AE"},
  {"name_ar":"عجمان","name_en":"Ajman","region_ar":"إمارة عجمان","region_en":"Ajman","is_popular":true,"lat":25.4052,"lng":55.5136,"country_code":"AE"},
  {"name_ar":"رأس الخيمة","name_en":"Ras Al Khaimah","region_ar":"إمارة رأس الخيمة","region_en":"Ras Al Khaimah","is_popular":true,"lat":25.7895,"lng":55.9432,"country_code":"AE"},
  {"name_ar":"الفجيرة","name_en":"Fujairah","region_ar":"إمارة الفجيرة","region_en":"Fujairah","is_popular":true,"lat":25.1288,"lng":56.3265,"country_code":"AE"},
  {"name_ar":"أم القيوين","name_en":"Umm Al Quwain","region_ar":"إمارة أم القيوين","region_en":"Umm Al Quwain","is_popular":true,"lat":25.5647,"lng":55.5553,"country_code":"AE"},
  {"name_ar":"خورفكان","name_en":"Khor Fakkan","region_ar":"إمارة الشارقة","region_en":"Sharjah","is_popular":false,"lat":25.3408,"lng":56.3508,"country_code":"AE"},
  {"name_ar":"كلباء","name_en":"Kalba","region_ar":"إمارة الشارقة","region_en":"Sharjah","is_popular":false,"lat":25.0667,"lng":56.35,"country_code":"AE"},
  {"name_ar":"دبا الفجيرة","name_en":"Dibba Al Fujairah","region_ar":"إمارة الفجيرة","region_en":"Fujairah","is_popular":false,"lat":25.6189,"lng":56.2661,"country_code":"AE"},
  {"name_ar":"مدينة زايد","name_en":"Madinat Zayed","region_ar":"إمارة أبو ظبي","region_en":"Abu Dhabi","is_popular":false,"lat":23.6551,"lng":53.7089,"country_code":"AE"},
  {"name_ar":"الرويس","name_en":"Al Ruwais","region_ar":"إمارة أبو ظبي","region_en":"Abu Dhabi","is_popular":false,"lat":24.0833,"lng":52.7,"country_code":"AE"},
  {"name_ar":"ليوا","name_en":"Liwa","region_ar":"إمارة أبو ظبي","region_en":"Abu Dhabi","is_popular":false,"lat":23.1333,"lng":53.4,"country_code":"AE"},
  {"name_ar":"غياثي","name_en":"Ghayathi","region_ar":"إمارة أبو ظبي","region_en":"Abu Dhabi","is_popular":false,"lat":23.8333,"lng":52.7833,"country_code":"AE"},
  {"name_ar":"مصفح","name_en":"Musaffah","region_ar":"إمارة أبو ظبي","region_en":"Abu Dhabi","is_popular":false,"lat":24.35,"lng":54.4833,"country_code":"AE"},
  {"name_ar":"جزيرة ياس","name_en":"Yas Island","region_ar":"إمارة أبو ظبي","region_en":"Abu Dhabi","is_popular":true,"lat":24.4979,"lng":54.6084,"country_code":"AE"},
  {"name_ar":"جزيرة السعديات","name_en":"Saadiyat Island","region_ar":"إمارة أبو ظبي","region_en":"Abu Dhabi","is_popular":true,"lat":24.5461,"lng":54.4411,"country_code":"AE"},
  {"name_ar":"جميرا","name_en":"Jumeirah","region_ar":"إمارة دبي","region_en":"Dubai","is_popular":true,"lat":25.2183,"lng":55.2551,"country_code":"AE"},
  {"name_ar":"المارينا","name_en":"Dubai Marina","region_ar":"إمارة دبي","region_en":"Dubai","is_popular":true,"lat":25.0805,"lng":55.1403,"country_code":"AE"},
  {"name_ar":"داون تاون دبي","name_en":"Downtown Dubai","region_ar":"إمارة دبي","region_en":"Dubai","is_popular":true,"lat":25.1972,"lng":55.2744,"country_code":"AE"},
  {"name_ar":"نخلة جميرا","name_en":"Palm Jumeirah","region_ar":"إمارة دبي","region_en":"Dubai","is_popular":true,"lat":25.1124,"lng":55.139,"country_code":"AE"},
  {"name_ar":"الخليج التجاري","name_en":"Business Bay","region_ar":"إمارة دبي","region_en":"Dubai","is_popular":true,"lat":25.1851,"lng":55.2642,"country_code":"AE"},
  {"name_ar":"مردف","name_en":"Mirdif","region_ar":"إمارة دبي","region_en":"Dubai","is_popular":false,"lat":25.2213,"lng":55.4245,"country_code":"AE"},

  // Kuwait (18 cities)
  {"name_ar":"مدينة الكويت","name_en":"Kuwait City","region_ar":"العاصمة","region_en":"Capital","is_popular":true,"lat":29.3759,"lng":47.9774,"country_code":"KW"},
  {"name_ar":"حولي","name_en":"Hawally","region_ar":"حولي","region_en":"Hawally","is_popular":true,"lat":29.3333,"lng":48.0333,"country_code":"KW"},
  {"name_ar":"الفروانية","name_en":"Farwaniya","region_ar":"الفروانية","region_en":"Farwaniya","is_popular":true,"lat":29.2764,"lng":47.9581,"country_code":"KW"},
  {"name_ar":"الجهراء","name_en":"Jahra","region_ar":"الجهراء","region_en":"Jahra","is_popular":true,"lat":29.3375,"lng":47.6581,"country_code":"KW"},
  {"name_ar":"الأحمدي","name_en":"Ahmadi","region_ar":"الأحمدي","region_en":"Ahmadi","is_popular":true,"lat":29.0769,"lng":48.0838,"country_code":"KW"},
  {"name_ar":"مبارك الكبير","name_en":"Mubarak Al Kabeer","region_ar":"مبارك الكبير","region_en":"Mubarak Al Kabeer","is_popular":true,"lat":29.2167,"lng":48.1,"country_code":"KW"},
  {"name_ar":"السالمية","name_en":"Salmiya","region_ar":"حولي","region_en":"Hawally","is_popular":true,"lat":29.3333,"lng":48.0667,"country_code":"KW"},
  {"name_ar":"الفحيحيل","name_en":"Fahaheel","region_ar":"الأحمدي","region_en":"Ahmadi","is_popular":false,"lat":29.0833,"lng":48.1333,"country_code":"KW"},
  {"name_ar":"المنقف","name_en":"Mangaf","region_ar":"الأحمدي","region_en":"Ahmadi","is_popular":false,"lat":29.0917,"lng":48.1231,"country_code":"KW"},
  {"name_ar":"الفنطاس","name_en":"Fintas","region_ar":"الأحمدي","region_en":"Ahmadi","is_popular":false,"lat":29.1667,"lng":48.1167,"country_code":"KW"},
  {"name_ar":"صباح السالم","name_en":"Sabah Al Salem","region_ar":"مبارك الكبير","region_en":"Mubarak Al Kabeer","is_popular":false,"lat":29.25,"lng":48.0667,"country_code":"KW"},
  {"name_ar":"الجابرية","name_en":"Jabriya","region_ar":"حولي","region_en":"Hawally","is_popular":false,"lat":29.3167,"lng":48.0333,"country_code":"KW"},
  {"name_ar":"بيان","name_en":"Bayan","region_ar":"حولي","region_en":"Hawally","is_popular":false,"lat":29.3,"lng":48.05,"country_code":"KW"},
  {"name_ar":"السرة","name_en":"Surra","region_ar":"العاصمة","region_en":"Capital","is_popular":false,"lat":29.3333,"lng":47.9833,"country_code":"KW"},
  {"name_ar":"الرميثية","name_en":"Rumaithiya","region_ar":"حولي","region_en":"Hawally","is_popular":false,"lat":29.3167,"lng":48.0833,"country_code":"KW"},
  {"name_ar":"السالمية","name_en":"Salmiya","region_ar":"حولي","region_en":"Hawally","is_popular":true,"lat":29.3333,"lng":48.0833,"country_code":"KW"},
  {"name_ar":"خيطان","name_en":"Khaitan","region_ar":"الفروانية","region_en":"Farwaniya","is_popular":false,"lat":29.2833,"lng":47.9667,"country_code":"KW"},
  {"name_ar":"جليب الشيوخ","name_en":"Jleeb Al Shuyoukh","region_ar":"الفروانية","region_en":"Farwaniya","is_popular":false,"lat":29.2833,"lng":47.9333,"country_code":"KW"},

  // Qatar (12 cities)
  {"name_ar":"الدوحة","name_en":"Doha","region_ar":"الدوحة","region_en":"Doha","is_popular":true,"lat":25.2854,"lng":51.531,"country_code":"QA"},
  {"name_ar":"الريان","name_en":"Al Rayyan","region_ar":"الريان","region_en":"Al Rayyan","is_popular":true,"lat":25.2919,"lng":51.4244,"country_code":"QA"},
  {"name_ar":"الوكرة","name_en":"Al Wakrah","region_ar":"الوكرة","region_en":"Al Wakrah","is_popular":true,"lat":25.1659,"lng":51.6067,"country_code":"QA"},
  {"name_ar":"الخور","name_en":"Al Khor","region_ar":"الخور","region_en":"Al Khor","is_popular":true,"lat":25.6839,"lng":51.4969,"country_code":"QA"},
  {"name_ar":"مسيعيد","name_en":"Mesaieed","region_ar":"الوكرة","region_en":"Al Wakrah","is_popular":false,"lat":24.9947,"lng":51.5483,"country_code":"QA"},
  {"name_ar":"الشمال","name_en":"Al Shamal","region_ar":"الشمال","region_en":"Al Shamal","is_popular":false,"lat":26.1,"lng":51.2167,"country_code":"QA"},
  {"name_ar":"أم صلال","name_en":"Umm Salal","region_ar":"أم صلال","region_en":"Umm Salal","is_popular":false,"lat":25.4167,"lng":51.4,"country_code":"QA"},
  {"name_ar":"الظعاين","name_en":"Al Daayen","region_ar":"الظعاين","region_en":"Al Daayen","is_popular":false,"lat":25.45,"lng":51.4667,"country_code":"QA"},
  {"name_ar":"اللؤلؤة","name_en":"The Pearl","region_ar":"الدوحة","region_en":"Doha","is_popular":true,"lat":25.3667,"lng":51.55,"country_code":"QA"},
  {"name_ar":"لوسيل","name_en":"Lusail","region_ar":"الدوحة","region_en":"Doha","is_popular":true,"lat":25.4167,"lng":51.4833,"country_code":"QA"},
  {"name_ar":"ويست باي","name_en":"West Bay","region_ar":"الدوحة","region_en":"Doha","is_popular":true,"lat":25.3167,"lng":51.5333,"country_code":"QA"},
  {"name_ar":"السد","name_en":"Al Sadd","region_ar":"الدوحة","region_en":"Doha","is_popular":false,"lat":25.2833,"lng":51.5,"country_code":"QA"},

  // Bahrain (16 cities)
  {"name_ar":"المنامة","name_en":"Manama","region_ar":"المنامة","region_en":"Capital","is_popular":true,"lat":26.2285,"lng":50.5860,"country_code":"BH"},
  {"name_ar":"المحرق","name_en":"Muharraq","region_ar":"المحرق","region_en":"Muharraq","is_popular":true,"lat":26.2572,"lng":50.6119,"country_code":"BH"},
  {"name_ar":"الرفاع","name_en":"Riffa","region_ar":"الجنوبية","region_en":"Southern","is_popular":true,"lat":26.13,"lng":50.555,"country_code":"BH"},
  {"name_ar":"مدينة حمد","name_en":"Hamad Town","region_ar":"الشمالية","region_en":"Northern","is_popular":true,"lat":26.1167,"lng":50.5,"country_code":"BH"},
  {"name_ar":"مدينة عيسى","name_en":"Isa Town","region_ar":"الجنوبية","region_en":"Southern","is_popular":true,"lat":26.1736,"lng":50.5478,"country_code":"BH"},
  {"name_ar":"سترة","name_en":"Sitra","region_ar":"المنامة","region_en":"Capital","is_popular":false,"lat":26.1544,"lng":50.6197,"country_code":"BH"},
  {"name_ar":"البديع","name_en":"Budaiya","region_ar":"الشمالية","region_en":"Northern","is_popular":false,"lat":26.2167,"lng":50.45,"country_code":"BH"},
  {"name_ar":"جد حفص","name_en":"Jidhafs","region_ar":"المنامة","region_en":"Capital","is_popular":false,"lat":26.2167,"lng":50.55,"country_code":"BH"},
  {"name_ar":"الحد","name_en":"Al Hidd","region_ar":"المحرق","region_en":"Muharraq","is_popular":false,"lat":26.2467,"lng":50.6533,"country_code":"BH"},
  {"name_ar":"عوالي","name_en":"Awali","region_ar":"الجنوبية","region_en":"Southern","is_popular":false,"lat":26.0667,"lng":50.5167,"country_code":"BH"},
  {"name_ar":"الزلاق","name_en":"Zallaq","region_ar":"الجنوبية","region_en":"Southern","is_popular":true,"lat":26.0333,"lng":50.45,"country_code":"BH"},
  {"name_ar":"جزر أمواج","name_en":"Amwaj Islands","region_ar":"المحرق","region_en":"Muharraq","is_popular":true,"lat":26.3,"lng":50.7,"country_code":"BH"},
  {"name_ar":"ديار المحرق","name_en":"Diyar Al Muharraq","region_ar":"المحرق","region_en":"Muharraq","is_popular":true,"lat":26.3333,"lng":50.6333,"country_code":"BH"},
  {"name_ar":"درة البحرين","name_en":"Durrat Al Bahrain","region_ar":"الجنوبية","region_en":"Southern","is_popular":true,"lat":25.8333,"lng":50.6,"country_code":"BH"},
  {"name_ar":"مرفأ البحرين","name_en":"Bahrain Bay","region_ar":"المنامة","region_en":"Capital","is_popular":true,"lat":26.2333,"lng":50.5833,"country_code":"BH"},
  {"name_ar":"السيف","name_en":"Seef","region_ar":"المنامة","region_en":"Capital","is_popular":true,"lat":26.2333,"lng":50.5333,"country_code":"BH"},

  // Oman (20 cities)
  {"name_ar":"مسقط","name_en":"Muscat","region_ar":"محافظة مسقط","region_en":"Muscat","is_popular":true,"lat":23.588,"lng":58.3829,"country_code":"OM"},
  {"name_ar":"صلالة","name_en":"Salalah","region_ar":"محافظة ظفار","region_en":"Dhofar","is_popular":true,"lat":17.0151,"lng":54.0924,"country_code":"OM"},
  {"name_ar":"صحار","name_en":"Sohar","region_ar":"محافظة شمال الباطنة","region_en":"North Al Batinah","is_popular":true,"lat":24.3643,"lng":56.7348,"country_code":"OM"},
  {"name_ar":"صور","name_en":"Sur","region_ar":"محافظة جنوب الشرقية","region_en":"South Ash Sharqiyah","is_popular":true,"lat":22.5667,"lng":59.5289,"country_code":"OM"},
  {"name_ar":"نزوى","name_en":"Nizwa","region_ar":"محافظة الداخلية","region_en":"Ad Dakhiliyah","is_popular":true,"lat":22.9333,"lng":57.5333,"country_code":"OM"},
  {"name_ar":"السيب","name_en":"Seeb","region_ar":"محافظة مسقط","region_en":"Muscat","is_popular":true,"lat":23.6733,"lng":58.1869,"country_code":"OM"},
  {"name_ar":"بركاء","name_en":"Barka","region_ar":"محافظة جنوب الباطنة","region_en":"South Al Batinah","is_popular":false,"lat":23.6833,"lng":57.8833,"country_code":"OM"},
  {"name_ar":"الرستاق","name_en":"Rustaq","region_ar":"محافظة جنوب الباطنة","region_en":"South Al Batinah","is_popular":false,"lat":23.3917,"lng":57.4264,"country_code":"OM"},
  {"name_ar":"عبري","name_en":"Ibri","region_ar":"محافظة الظاهرة","region_en":"Ad Dhahirah","is_popular":false,"lat":23.225,"lng":56.5167,"country_code":"OM"},
  {"name_ar":"بهلاء","name_en":"Bahla","region_ar":"محافظة الداخلية","region_en":"Ad Dakhiliyah","is_popular":false,"lat":22.9667,"lng":57.3,"country_code":"OM"},
  {"name_ar":"إبراء","name_en":"Ibra","region_ar":"محافظة شمال الشرقية","region_en":"North Ash Sharqiyah","is_popular":false,"lat":22.6833,"lng":58.5333,"country_code":"OM"},
  {"name_ar":"خصب","name_en":"Khasab","region_ar":"محافظة مسندم","region_en":"Musandam","is_popular":true,"lat":26.1833,"lng":56.25,"country_code":"OM"},
  {"name_ar":"مطرح","name_en":"Muttrah","region_ar":"محافظة مسقط","region_en":"Muscat","is_popular":true,"lat":23.6156,"lng":58.5678,"country_code":"OM"},
  {"name_ar":"القرم","name_en":"Qurum","region_ar":"محافظة مسقط","region_en":"Muscat","is_popular":true,"lat":23.5931,"lng":58.4097,"country_code":"OM"},
  {"name_ar":"الموج","name_en":"Al Mouj","region_ar":"محافظة مسقط","region_en":"Muscat","is_popular":true,"lat":23.6333,"lng":58.2667,"country_code":"OM"},
  {"name_ar":"العذيبة","name_en":"Al Azaiba","region_ar":"محافظة مسقط","region_en":"Muscat","is_popular":false,"lat":23.62,"lng":58.35,"country_code":"OM"},
  {"name_ar":"الخوير","name_en":"Al Khuwair","region_ar":"محافظة مسقط","region_en":"Muscat","is_popular":false,"lat":23.6,"lng":58.4,"country_code":"OM"},
  {"name_ar":"بوشر","name_en":"Bausher","region_ar":"محافظة مسقط","region_en":"Muscat","is_popular":false,"lat":23.55,"lng":58.4,"country_code":"OM"},
  {"name_ar":"العامرات","name_en":"Al Amerat","region_ar":"محافظة مسقط","region_en":"Muscat","is_popular":false,"lat":23.5,"lng":58.5,"country_code":"OM"},
  {"name_ar":"مسقط القديمة","name_en":"Old Muscat","region_ar":"محافظة مسقط","region_en":"Muscat","is_popular":true,"lat":23.6139,"lng":58.5944,"country_code":"OM"}
];

async function seedGCCCities() {
  console.log('🌍 Seeding GCC cities (SA, AE, KW, QA, BH, OM)...');
  
  try {
    const countriesResult = await db.query(`
      SELECT id, code, name_ar FROM countries WHERE code IN ('SA', 'AE', 'KW', 'QA', 'BH', 'OM')
    `);
    
    const countryMap = {};
    for (const country of countriesResult.rows) {
      countryMap[country.code] = { id: country.id, name_ar: country.name_ar };
    }
    
    console.log('Found countries:', Object.keys(countryMap));
    
    let inserted = 0;
    let skipped = 0;
    
    for (const city of gccCitiesData) {
      const countryInfo = countryMap[city.country_code];
      if (!countryInfo) {
        console.log(`⚠️ Country not found: ${city.country_code}`);
        continue;
      }
      
      const existingCheck = await db.query(
        'SELECT id FROM cities WHERE name_en = $1 AND country_id = $2',
        [city.name_en, countryInfo.id]
      );
      
      if (existingCheck.rows.length > 0) {
        skipped++;
        continue;
      }
      
      await db.query(`
        INSERT INTO cities (name_ar, name_en, region_ar, region_en, country_id, is_popular, display_order, is_active, latitude, longitude)
        VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, $9)
        ON CONFLICT DO NOTHING
      `, [
        city.name_ar, 
        city.name_en, 
        city.region_ar || '', 
        city.region_en || '', 
        countryInfo.id, 
        city.is_popular, 
        0,
        city.lat || null, 
        city.lng || null
      ]);
      inserted++;
    }
    
    console.log(`✅ GCC cities: ${inserted} inserted, ${skipped} already existed`);
    
    const countResult = await db.query(`
      SELECT co.code, co.name_ar, COUNT(c.id) as city_count
      FROM countries co
      LEFT JOIN cities c ON c.country_id = co.id
      WHERE co.code IN ('SA', 'AE', 'KW', 'QA', 'BH', 'OM')
      GROUP BY co.id, co.code, co.name_ar
      ORDER BY co.display_order
    `);
    
    console.log('\n📊 GCC Cities count:');
    for (const row of countResult.rows) {
      console.log(`  ${row.name_ar} (${row.code}): ${row.city_count} cities`);
    }
    
    console.log('\n✅ GCC cities seeding completed!');
    
  } catch (error) {
    console.error('❌ Error seeding GCC cities:', error);
    throw error;
  }
}

if (require.main === module) {
  seedGCCCities()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { seedGCCCities };
