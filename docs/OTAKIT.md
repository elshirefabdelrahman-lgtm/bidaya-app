# ربط Bidaya بـOtaKit

الحالة الحالية: أُضيفت @otakit/capacitor-updater 3.3.0 وتأكيد جاهزية الواجهة بعد عرض شاشة الدخول، مع اختبارات للفصل بين المتصفح وAndroid ولمنع التأكيد المكرر. اكتمل تسجيل الدخول وتسجيل التطبيق بمعرف 6072c836-9cc2-4850-b74b-eb4d55465209 وقناة base وruntimeVersion=android-1.1. رُفعت ونُشرت الحزمة web-1.1.0-initial بمعرف 149fb1e7-3caa-4541-b64f-e5d426017c20. لم يُختبر تنزيلها على هاتف فعلي بعد. نسخة 1.0 القديمة لا تستقبل OTA.

لا ترفع مجلد المشروع كاملًا إلى OtaKit. التطبيق المسجل في الحساب يتلقى ملفات Web الموجودة في dist فقط؛ تظل البيانات والمصادقة في Supabase. لا تضع مفاتيح OtaKit أو Supabase الإدارية في الواجهة أو capacitor.config.json.

## خطوات الإعداد وإعادة تجهيز جهاز البناء

1. من Terminal داخل المشروع، شغّل `npx -y @otakit/cli@1.11.0 login` وأدخل البريد ورمز البريد بنفسك. لا تستخدم --token-only ولا ترسل الرمز في المحادثة.
2. افحص whoami للتأكد من الحساب ومساحة العمل الصحيحة. سجّل Bidaya مرة واحدة من لوحة الحساب أو `register --slug com.bidaya.center`، مع التحقق من عدم وجود تسجيل سابق قبل الإعادة.
3. ضع معرف OtaKit الذي يعيده الحساب في plugins.OtaKit.appId. هذا معرف منفصل عن Android appId=com.bidaya.center. استخدم runtimeVersion=android-1.1 وقناة base، وتفعيل التحديث عند التشغيل البارد والخلفية عند العودة، دون فرض إعادة تشغيل أثناء تسجيل حركة مالية.
4. ابنِ Web ثم cap sync Android، وبعدها APK Release versionCode=2/versionName=1.1.0 بنفس مفتاح التوقيع السابق. لا تسلّم نسخة قبل وضع appId الحقيقي والتحقق منها.
5. ارفع dist بإصدار واضح مع --strict-artifacts و--fail-on-incompatible، واختبر قناة الإصدار على جهاز مثبت فعليًا قبل اعتماده للعملاء. تأكيد notifyAppReady لا يثبت نجاح تنزيل OTA فعلي على جهاز.

## التحديثات المباشرة لاحقًا

بعد الربط والاختبارات:

```powershell
npm run build
npx -y @otakit/cli@1.11.0 upload dist --version web-YYYYMMDD-N --release --fail-on-incompatible --strict-artifacts
```

ملفات SQL وتعديلات Edge Functions لا تُنفذ بواسطة OTA. الإضافات الأصلية وصلاحيات Android وتغيير الحد الأدنى للنظام تحتاج APK جديدًا وزيادة runtimeVersion عند تغير توافق Native. لا تستخدم --ignore-compat أو --force-immediate كطريقة روتينية للنشر.

## GitHub Actions

أُضيف workflow في .github/workflows/otakit.yml، وهو مُعطّل افتراضيًا لحين قبول أول نسخة على الجهاز. بعد نجاح القبول، أضف مفتاح OtaKit محدود النطاق إلى GitHub Repository Secret باسم OTAKIT_TOKEN من واجهة GitHub مباشرة، وأضف Repository Variable باسم OTAKIT_AUTOPUBLISH وقيمته true. لا ترسل المفتاح في محادثة ولا تضعه في ملف.

عند تفعيله: push إلى main لتعديلات الواجهة → npm ci/check/test/build → فحص توافق Native → رفع ونشر dist. يتوقف النشر عند فشل الفحص أو غياب السر. هذا الملف وحده لا يعني أن Secrets أو النشر التلقائي قد فُعّلت فعليًا.

## تحقق النسخة 1.1.0

نجح بناء APK Release وتوقيعه، وتأكد تطابق شهادة التوقيع مع 1.0، وزيادة versionCode إلى 2، ووجود إضافة OtaKit وإعداد appId الحقيقي وruntime android-1.1 داخل الحزمة. ملف artifacts/Bidaya-1.1.0.apk حجمه 6,669,131 بايت، وSHA-256: 4f2c7a2a1b32716b50d21b059f1b2c0b894e15fc9e92152bdbd852f4d18fb01f. طابقت الواجهة المضمّنة ناتج dist، مع بقاء عنوان Supabase الصحيح وغياب ملفات المفاتيح الخاصة.

نجح npm test: عدد 56، صفر فشل، ونجحت أوامر check وtest:case-payments وtest:ui وtest:supabase-ui وbuild. تأكد سجل OtaKit من نشر web-1.1.0-initial على base/runtime android-1.1. لم يُوصل هاتف Android؛ لم يُختبر تثبيت 1.1.0 أو تنزيل OTA أو الرجوع الآمن على جهاز فعلي بعد. الرفع إلى GitHub لا ينشر OTA تلقائيًا حتى إضافة Secret وتفعيل Variable المذكورين أعلاه. لم تُعدّل قاعدة بيانات Supabase أو Functions في هذه المرحلة.
