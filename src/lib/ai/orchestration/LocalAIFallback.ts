export interface LocalAIResponse {
  content: string;
  provider: string;
  model: string;
  finishReason: string;
}

const PROVIDER = 'Rafiq Local AI';
const MODEL = 'rafiq-local-v1';
const FINISH_REASON = 'stop';

function isArabic(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

function normalizeArabic(text: string): string {
  return text
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/\u0622/g, '\u0627')
    .replace(/\u0623/g, '\u0627')
    .replace(/\u0625/g, '\u0627')
    .replace(/\u0629/g, '\u0647')
    .replace(/\u0649/g, '\u064A')
    .toLowerCase();
}

function normalizeEnglish(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function phraseMatch(normalizedText: string, phrase: string, arabic: boolean): boolean {
  const np = arabic ? normalizeArabic(phrase) : normalizeEnglish(phrase);
  if (!np) return false;
  const words = np.split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;
  if (arabic) {
    return words.every(w => normalizedText.includes(w));
  }
  return words.every(w => {
    const re = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    return re.test(normalizedText);
  });
}

function anyPhraseMatch(normalizedText: string, phrases: string[], arabic: boolean): boolean {
  return phrases.some(p => phraseMatch(normalizedText, p, arabic));
}

const EMERGENCY_PATTERNS_EN: string[] = [
  'chest pain',
  'pain in chest',
  'pressure in chest',
  'heart attack',
  'i am having a heart attack',
  'having a stroke',
  'stroke symptoms',
  'face drooping',
  'arm weakness',
  'slurred speech',
  "can't breathe",
  'cant breathe',
  'cannot breathe',
  'difficulty breathing',
  'shortness of breath',
  'trouble breathing',
  'severe bleeding',
  'bleeding heavily',
  'bleeding wont stop',
  'unconscious',
  'passed out',
  'fainted',
  'not breathing',
  'stopped breathing',
  'suicidal',
  'suicide',
  'want to die',
  'kill myself',
  'harm myself',
  'overdose',
  'took too many pills',
  'seizure',
  'convulsing',
  'choking',
  'cannot swallow',
  'severe burn',
  'electric shock',
  'drowning',
  'anaphylaxis',
  'severe allergic reaction',
  'throat closing',
  'lips swelling',
  'tongue swelling',
  'blood pressure very high',
  'blood pressure is 200',
  'blood pressure very low',
  'worst headache of my life',
  'worst headache ever',
  'sudden severe headache',
  'paralyzed',
  'paralysis',
  'numbness in face',
  'numb face',
  'one side of body weak',
  'coughing up blood',
  'vomiting blood',
  'blood in stool',
  'severe abdominal pain',
];

const EMERGENCY_PATTERNS_AR: string[] = [
  'الم في الصدر',
  'الام في الصدر',
  'الم بالصدر',
  'ضغط على الصدر',
  'ضغط في الصدر',
  'ذبحة صدرية',
  'سكتة قلبية',
  'جلطة قلبية',
  'سكتة دماغية',
  'جلطة دماغية',
  'لا استطيع التنفس',
  'لا اقدر على التنفس',
  'صعوبة في التنفس',
  'صعوبة التنفس',
  'ضيق في التنفس',
  'ضيق تنفس',
  'انقطاع النفس',
  'نزيف شديد',
  'نزيف لا يتوقف',
  'افقد الوعي',
  'فقدان الوعي',
  'اغماء',
  'لا يتنفس',
  'توقف التنفس',
  'انتحار',
  'اريد ان اموت',
  'اقتل نفسي',
  'اذي نفسي',
  'جرعة زائدة',
  'اخذت حبوب كثيرة',
  'تشنج',
  'تشنج',
  'اختناق',
  'لا استطيع البلع',
  'حرق شديد',
  'صعق كهربائي',
  'صعقة كهربائية',
  'غرق',
  'صدمة حساسية',
  'حساسية شديدة',
  'تورم الشفتين',
  'تورم اللسان',
  'يغلق الحلق',
  'ضغط الدم مرتفع جدا',
  'ضغط الدم عالي جدا',
  'ضغط الدم منخفض جدا',
  'اسوا صداع في حياتي',
  'صداع شديد مفاجئ',
  'شلل',
  'تنميل في الوجه',
  'تنميل الوجه',
  'ضعف في جانب واحد',
  'اعوق دم',
  'اقي دم',
  'دم في البراز',
  'الم شديد في البطن',
];

function isEmergency(text: string, arabic: boolean): boolean {
  if (arabic) {
    const n = normalizeArabic(text);
    return anyPhraseMatch(n, EMERGENCY_PATTERNS_AR, true);
  }
  const n = normalizeEnglish(text);
  return anyPhraseMatch(n, EMERGENCY_PATTERNS_EN, false);
}

type Topic =
  | 'medication'
  | 'vitals_heart'
  | 'vitals_bp'
  | 'vitals_oxygen'
  | 'vitals_temp'
  | 'fever'
  | 'sleep'
  | 'food'
  | 'emergency_contacts'
  | 'profile'
  | 'greeting'
  | 'thanks'
  | 'help'
  | 'unknown';

interface TopicRule {
  topic: Topic;
  en: string[];
  ar: string[];
}

const TOPIC_RULES: TopicRule[] = [
  {
    topic: 'medication',
    en: ['medication', 'medications', 'medicine', 'medicines', 'meds', 'pill', 'pills', 'dose', 'dosage',
         'reminder medication', 'take my meds', 'forgot meds', 'missed dose',
         'side effect', 'side effects', 'prescription', 'drug interaction'],
    ar: ['دواء', 'ادوية', 'حبة', 'حبوب', 'جرعة', 'جرعات', 'تذكير دواء',
         'نسيت دواء', 'عرض جانبي', 'اعراض جانبية', 'تعاطي', 'وصفة طبية', 'تفاعل دواء'],
  },
  {
    topic: 'vitals_heart',
    en: ['heart rate', 'pulse', 'bpm', 'heartbeat', 'heart beat', 'resting heart',
         'fast heart', 'slow heart', 'palpitation', 'tachycardia', 'bradycardia'],
    ar: ['نبض القلب', 'نبض', 'ضربات القلب', 'معدل ضربات', 'تسارع القلب',
         'تباطؤ القلب', 'خفقان'],
  },
  {
    topic: 'vitals_bp',
    en: ['blood pressure', 'bp', 'systolic', 'diastolic', 'hypertension',
         'hypotension', 'high bp', 'low bp'],
    ar: ['ضغط الدم', 'ضغط', 'الانقباضي', 'الانبساطي', 'ارتفاع ضغط',
         'انخفاض ضغط', 'ضغط مرتفع', 'ضغط منخفض'],
  },
  {
    topic: 'vitals_oxygen',
    en: ['oxygen', 'oxygen level', 'spo2', 'o2 saturation', 'blood oxygen',
         'saturation'],
    ar: ['الاكسجين', 'الاكسيجين', 'تشبع الاكسجين', 'تشبع الدم', 'سبو تو',
         'نسبة الاكسجين'],
  },
  {
    topic: 'fever',
    en: ['fever', 'how to lower fever', 'reduce fever', 'febrile', 'hot to touch',
         'running a fever', 'i have a fever'],
    ar: ['حمى', 'كيف اخفض الحمى', 'خفض الحمى', 'حرارة عالية', 'سخونة'],
  },
  {
    topic: 'vitals_temp',
    en: ['temperature', 'body temp', 'high temp', 'low temp',
         'hypothermia', 'thermometer'],
    ar: ['درجة الحرارة', 'حرارة الجسم', 'حرارتي',
         'حرارة مرتفعة', 'حرارة منخفضة', 'ميزان حرارة'],
  },
  {
    topic: 'sleep',
    en: ['sleep', 'insomnia', 'cannot sleep', "can't sleep", 'tired',
         'exhausted', 'sleep quality', 'rest', 'nap'],
    ar: ['نوم', 'النوم', 'ارق', 'لا استطيع النوم', 'لا اقدر على النوم',
         'تعب', 'مرهق', 'جودة النوم', 'راحة', 'قيلولة'],
  },
  {
    topic: 'food',
    en: ['food', 'meal', 'eat', 'diet', 'nutrition', 'healthy meal',
         'what should i eat', 'breakfast', 'lunch', 'dinner', 'snack',
         'calories', 'hydration', 'water intake'],
    ar: ['طعام', 'الاكل', 'وجبة', 'وجبات', 'نظام غذائي', 'تغذية',
         'وجبة صحية', 'ماذا اكل', 'فطور', 'غداء', 'عشاء', 'سناك',
         'سعرات حرارية', 'شرب الماء', 'ترطيب'],
  },
  {
    topic: 'emergency_contacts',
    en: ['emergency contact', 'emergency number', 'ice contact', 'in case of emergency',
         'who to call', 'emergency services'],
    ar: ['جهة اتصال الطوارئ', 'رقم الطوارئ', 'اتصال الطوارئ', 'لمن اتصل',
         'خدمات الطوارئ', 'طوارئ'],
  },
  {
    topic: 'profile',
    en: ['profile', 'my info', 'my information', 'medical file', 'health record',
         'update profile', 'complete profile'],
    ar: ['الملف الشخصي', 'الملف الطبي', 'ملفي', 'ملفك', 'ملفك الطبي',
         'معلوماتي', 'بياناتي', 'سجلي الصحي',
         'تحديث الملف', 'اكمال الملف', 'اكمال ملفي'],
  },
  {
    topic: 'greeting',
    en: ['hello', 'hi', 'hey', 'good morning', 'good evening', 'good afternoon',
         'salam', 'assalam', 'how are you'],
    ar: ['مرحبا', 'اهلا', 'السلام عليكم', 'سلام عليكم', 'صباح الخير',
         'مساء الخير', 'كيف حالك', 'اهلا بك'],
  },
  {
    topic: 'thanks',
    en: ['thank', 'thanks', 'thank you', 'thx', 'appreciate', 'grateful'],
    ar: ['شكرا', 'شكرا لك', 'مشكور', 'ممتن', 'تسلم'],
  },
  {
    topic: 'help',
    en: ['help', 'what can you do', 'who are you', 'what are you', 'commands',
         'features', 'how to use'],
    ar: ['مساعدة', 'ساعدني', 'ماذا تستطيع', 'من انت', 'مميزات', 'كيف الاستخدام'],
  },
];

function detectTopic(text: string, arabic: boolean): Topic {
  if (arabic) {
    const n = normalizeArabic(text);
    for (const rule of TOPIC_RULES) {
      if (anyPhraseMatch(n, rule.ar, true)) return rule.topic;
    }
  } else {
    const n = normalizeEnglish(text);
    for (const rule of TOPIC_RULES) {
      if (anyPhraseMatch(n, rule.en, false)) return rule.topic;
    }
  }
  return 'unknown';
}

function buildEmergencyResponse(arabic: boolean): string {
  return arabic
    ? [
        '🚨 هذه الحالة قد تكون طارئة طبية.',
        '',
        'يرجى الاتصال بخدمات الطوارئ المحلية فوراً (مثل 911 أو رقم الطوارئ في بلدك).',
        '',
        '• إذا كنت تعاني من حساسية شديدة (صدمة تحسسية) ولديك حقنة إبينفرين، استخدمها الآن ثم اتصل بالطوارئ.',
        '• لا تقُد السيارة بنفسك — اطلب من شخص آخر أن يأخذك أو اتصل بالإسعاف.',
        '• إذا كان الشخص فاقداً للوعي أو لا يتنفس، ابدأ الإنعاش القلبي الرئوي (CPR) إذا كنت مدرّباً عليه.',
        '',
        'سأبقى هنا لمساعدتك بعد الاتصال بخدمات الطوارئ.',
        '',
        '— تنبيه: هذا رد من المساعد المحلي (offline) لأن خدمة الذكاء الاصطناعي عن بُعد غير متاحة حالياً.',
      ].join('\n')
    : [
        '🚨 This sounds like it may be a medical emergency.',
        '',
        'Please call your local emergency number immediately (e.g. 911 or your country\'s emergency line).',
        '',
        '• If you have a known severe allergy (anaphylaxis) and an epinephrine auto-injector, use it now, then call emergency services.',
        '• Do not drive yourself — have someone take you or call an ambulance.',
        '• If the person is unconscious or not breathing, begin CPR if you are trained to do so.',
        '',
        'I will stay here to help once you have contacted emergency services.',
        '',
        '— Note: this response is from the local offline assistant because the remote AI service is unavailable.',
      ].join('\n');
}

function buildMedicationResponse(arabic: boolean): string {
  return arabic
    ? [
        '💊 حول الأدوية:',
        '',
        '• التزم بالجرعات والأوقات التي وصفها طبيبك أو الصيدلي.',
        '• إذا نسيت جرعة، لا تأخذ جرعة مضاعفة — راجع الصيدلي أو طبيبك حول ما يجب فعله.',
        '• احفظ الأدوية بعيداً عن متناول الأطفال والحرارة الزائدة.',
        '• أبلغ طبيبك عن أي أعراض جانبية جديدة (طفح، تورم، صعوبة تنفس، غثيان شديد).',
        '',
        'يمكنك استخدام قسم "الأدوية" في التطبيق لتفعيل التذكيرات اليومية بجرعاتك.',
        '',
        '⚠️ هذا رد عام لأغراض تثقيفية فقط ولا يُغني عن استشارة طبيب أو صيدلي مرخّص.',
        '— (وضع عدم الاتصال — الردود الذكية الكاملة غير متاحة حالياً.)',
      ].join('\n')
    : [
        '💊 About medications:',
        '',
        '• Follow the doses and schedule prescribed by your doctor or pharmacist.',
        '• If you miss a dose, do NOT take a double dose — check with your pharmacist or doctor about what to do.',
        '• Store medicines away from children and excess heat/moisture.',
        '• Tell your doctor about any new side effects (rash, swelling, breathing trouble, severe nausea).',
        '',
        'You can use the "Medications" tab in the app to set daily reminders for your doses.',
        '',
        '⚠️ This is general educational guidance only and does not replace advice from a licensed doctor or pharmacist.',
        '— (Offline mode — full AI responses are currently unavailable.)',
      ].join('\n');
}

function buildHeartRateResponse(arabic: boolean): string {
  return arabic
    ? [
        '❤️ نبض القلب:',
        '',
        '• معدل النبض الطبيعي للبالغين أثناء الراحة يتراوح عادةً بين 60 و100 نبضة في الدقيقة.',
        '• الرياضيون قد يكون نبضهم أقل (40-60) وهذا طبيعي لهم.',
        '• النبض فوق 120 أثناء الراحة، أو المصحوب بألم صدر أو دوار أو ضيق تنفس، يستدعي مراجعة الطوارئ.',
        '• النبض أقل من 50 (لغير الرياضيين) مع دوار أو إغماء يستدعي استشارة الطبيب.',
        '',
        'سجّل قراءاتك بانتظام في التطبيق لمتابعة الاتجاه بدلاً من قياس واحد فقط.',
        '',
        '⚠️ هذه معلومات تثقيفية عامة. راجع طبيباً لتقييم حالتك الخاصة.',
        '— (وضع عدم الاتصال.)',
      ].join('\n')
    : [
        '❤️ Heart rate:',
        '',
        '• Normal resting heart rate for adults is usually between 60 and 100 bpm.',
        '• Athletes may naturally have a lower rate (40-60 bpm).',
        '• A rate above 120 bpm at rest — especially with chest pain, dizziness, or shortness of breath — warrants emergency care.',
        '• A rate below 50 bpm (for non-athletes) with dizziness or fainting should be discussed with a doctor.',
        '',
        'Log your readings regularly in the app to track trends rather than relying on a single reading.',
        '',
        '⚠️ This is general educational information. See a doctor for a personal assessment.',
        '— (Offline mode.)',
      ].join('\n');
}

function buildBloodPressureResponse(arabic: boolean): string {
  return arabic
    ? [
        '🩸 ضغط الدم:',
        '',
        '• القراءة الطبيعية للبالغين عادةً أقل من 120/80 مم زئبق.',
        '• ارتفاع ضغط الدم (140/90 أو أعلى باستمرار) يستدعي متابعة طبية.',
        '• انخفاض ضغط الدم المصحوب بدوار أو إغماء يستدعي استشارة الطبيب.',
        '• قِس الضغط بعد 5 دقائق من الراحة، وبعد تجنب الكافيين والنيكوتين لمدة 30 دقيقة.',
        '',
        'سجّل قراءاتك في التطبيق على مدى عدة أيام لمتابعة الاتجاه.',
        '',
        '⚠️ لا توقف أو تعدّل دواء ضغط الدم من تلقاء نفسك. راجع طبيبك.',
        '— (وضع عدم الاتصال.)',
      ].join('\n')
    : [
        '🩸 Blood pressure:',
        '',
        '• A normal adult reading is usually below 120/80 mmHg.',
        '• Consistently 140/90 or higher warrants medical follow-up.',
        '• Low blood pressure with dizziness or fainting should be discussed with a doctor.',
        '• Measure after 5 minutes of rest, and avoid caffeine/nicotine for 30 minutes beforehand.',
        '',
        'Log readings in the app across several days to see the trend.',
        '',
        '⚠️ Do NOT stop or adjust blood pressure medication on your own. Consult your doctor.',
        '— (Offline mode.)',
      ].join('\n');
}

function buildOxygenResponse(arabic: boolean): string {
  return arabic
    ? [
        '🫁 نسبة الأكسجين (SpO₂):',
        '',
        '• النسبة الطبيعية عادةً 95% أو أعلى عند البالغين الأصحاء على مستوى سطح البحر.',
        '• بين 90% و94% قد تستدعي مراجعة الطبيب، خصوصاً مع ضيق تنفس أو سعال.',
        '• أقل من 90% يُعتبر منخفضاً وقد يستدعي التقييم في الطوارئ.',
        '• تأكد من ثبات اليد ودفئها قبل القياس، فالأصابع الباردة تعطي قراءات منخفضة غير دقيقة.',
        '',
        'إذا كانت القراءة منخفضة باستمرار، راجع طبيبك.',
        '',
        '⚠️ هذه معلومات تثقيفية عامة ولا تُغني عن التقييم الطبي.',
        '— (وضع عدم الاتصال.)',
      ].join('\n')
    : [
        '🫁 Oxygen saturation (SpO₂):',
        '',
        '• Normal is usually 95% or higher for healthy adults at sea level.',
        '• Between 90% and 94% may warrant medical review, especially with shortness of breath or cough.',
        '• Below 90% is considered low and may need emergency evaluation.',
        '• Make sure your hand is still and warm before measuring — cold fingers give falsely low readings.',
        '',
        'If readings are consistently low, see your doctor.',
        '',
        '⚠️ This is general educational information and does not replace medical evaluation.',
        '— (Offline mode.)',
      ].join('\n');
}

function buildTemperatureResponse(arabic: boolean): string {
  return arabic
    ? [
        '🌡️ درجة حرارة الجسم:',
        '',
        '• الطبيعية للبالغين عادةً بين 36.1°م و37.2°م (97°F - 99°F).',
        '• الحمى: 38°م (100.4°ف) أو أعلى.',
        '• الحمى الشديدة فوق 39.4°م (103°ف) تستدعي مراجعة الطبيب.',
        '• شرب السوائل، الراحة، والكمّادات الفاترة تساعد على تخفيف الحمى الخفيفة.',
        '• لا تستخدم الكمّادات الباردة أو الكحول على الجلد.',
        '',
        'الحمى المصحوبة بتيبس الرقبة، طفح جلدي غير مزيل بالضغط، صعوبة في التنفس، أو تشوّش الوعي تستدعي الطوارئ فوراً.',
        '',
        '⚠️ استشر صيدلياً أو طبيباً قبل إعطاء أي دواء خافض للحرارة، خصوصاً للأطفال.',
        '— (وضع عدم الاتصال.)',
      ].join('\n')
    : [
        '🌡️ Body temperature:',
        '',
        '• Normal for adults is usually 36.1°C to 37.2°C (97°F - 99°F).',
        '• Fever: 38°C (100.4°F) or higher.',
        '• High fever above 39.4°C (103°F) should be evaluated by a doctor.',
        '• Fluids, rest, and lukewarm sponging help relieve mild fever.',
        '• Do NOT use cold water or rubbing alcohol on the skin.',
        '',
        'Fever with stiff neck, a rash that does not fade under pressure, trouble breathing, or confusion warrants emergency care immediately.',
        '',
        '⚠️ Consult a pharmacist or doctor before giving any fever-reducing medicine, especially to children.',
        '— (Offline mode.)',
      ].join('\n');
}

function buildFeverResponse(arabic: boolean): string {
  return arabic
    ? [
        '🔥 خفض الحمى:',
        '',
        '• اشرب الكثير من السوائل (ماء، مرق، عصير مخفف).',
        '• ارتدِ ملابس خفيفة وغطّية خفيفة فقط.',
        '• استخدم كمّادات فاترة (ليست باردة) على الجبهة والإبطين.',
        '• أرح جسمك تماماً.',
        '• الباراسيتامول أو الإيبوبروفين بجرعة مناسبة لعمر العمر قد يساعد — راجع الصيدلي.',
        '',
        'اطلب الطوارئ فوراً إذا: تجاوزت الحرارة 39.4°م، أو رافقها تيبس رقبة، طفح غير مزول بالضغط، تشوّش، صعوبة تنفس، أو استمرت أكثر من 3 أيام.',
        '',
        '⚠️ لا تعطِ الأسبرين للأطفال أو المراهقين.',
        '— (وضع عدم الاتصال.)',
      ].join('\n')
    : [
        '🔥 Lowering a fever:',
        '',
        '• Drink plenty of fluids (water, broth, diluted juice).',
        '• Wear light clothing and use a light cover only.',
        '• Use lukewarm (NOT cold) sponging on the forehead and underarms.',
        '• Rest fully.',
        '• Paracetamol or ibuprofen at an age-appropriate dose may help — ask a pharmacist.',
        '',
        'Seek emergency care if: temperature exceeds 39.4°C, or is accompanied by stiff neck, a rash that does not fade under pressure, confusion, trouble breathing, or lasts more than 3 days.',
        '',
        '⚠️ Do NOT give aspirin to children or teenagers.',
        '— (Offline mode.)',
      ].join('\n');
}

function buildSleepResponse(arabic: boolean): string {
  return arabic
    ? [
        '😴 النوم والراحة:',
        '',
        '• اهدف إلى 7-9 ساعات نوم للبالغين.',
        '• حافظ على مواعيد نوم واستيقاظ ثابتة حتى في عطلات نهاية الأسبوع.',
        '• تجنّب الكافيين والنيكوتين بعد الظهر.',
        '• أطفئ الشاشات قبل النوم بساعة على الأقل، أو فعّل وضع الليل.',
        '• أوجد روتيناً مريحاً قبل النوم (قراءة، استرخاء، حمّام دافئ).',
        '',
        'إذا استمر الأرق أكثر من 4 أسابيع، أو ترافق مع شخير عالٍ أو توقّف التنفس أثناء النوم، فاستشر طبيباً.',
        '',
        '⚠️ معلومات تثقيفية عامة. استشر طبيباً للمشاكل المزمنة.',
        '— (وضع عدم الاتصال.)',
      ].join('\n')
    : [
        '😴 Sleep and rest:',
        '',
        '• Aim for 7-9 hours of sleep per night for adults.',
        '• Keep a consistent sleep/wake schedule, even on weekends.',
        '• Avoid caffeine and nicotine in the afternoon.',
        '• Turn off screens at least an hour before bed, or use night mode.',
        '• Build a relaxing pre-bed routine (reading, stretching, warm bath).',
        '',
        'If insomnia lasts more than 4 weeks, or comes with loud snoring or breathing pauses during sleep, see a doctor.',
        '',
        '⚠️ General educational info. See a doctor for chronic issues.',
        '— (Offline mode.)',
      ].join('\n');
}

function buildFoodResponse(arabic: boolean): string {
  return arabic
    ? [
        '🥗 التغذية الصحية:',
        '',
        '• املأ نصف طبقك بالخضروات والفواكه الملونة.',
        '• اختر الحبوب الكاملة (شوفان، أرز بني، خبز كامل) بدلاً من المكررة.',
        '• اجعل البروتين خفيفاً (دجاج، سمك، بقوليات، بيض، توفو).',
        '• قلّل السكريات المضافة والمشروبات الغازية والحلويات.',
        '• اشرب الماء أولاً عند العطش — راجع ترطيبك عبر لون البول (أصفر فاتح = جيد).',
        '',
        'حاول تحضير وجباتك مسبقاً لتجنّب الخيارات السريعة غير الصحية.',
        '',
        '⚠️ إذا كنت تعاني من حالة مزمنة (سكري، ارتفاع ضغط، أمراض كلى)، اتبع خطة غذائية يضعها أخصائي تغذية أو طبيب.',
        '— (وضع عدم الاتصال.)',
      ].join('\n')
    : [
        '🥗 Healthy nutrition:',
        '',
        '• Fill half your plate with colorful vegetables and fruits.',
        '• Choose whole grains (oats, brown rice, whole-wheat bread) over refined.',
        '• Keep protein lean (chicken, fish, legumes, eggs, tofu).',
        '• Cut added sugars, sodas, and sweets.',
        '• Drink water first when thirsty — check hydration via urine color (pale yellow is good).',
        '',
        'Try prepping meals ahead to avoid unhealthy fast-food choices.',
        '',
        '⚠️ If you have a chronic condition (diabetes, hypertension, kidney disease), follow a meal plan set by a registered dietitian or doctor.',
        '— (Offline mode.)',
      ].join('\n');
}

function buildEmergencyContactsResponse(arabic: boolean): string {
  return arabic
    ? [
        '📞 جهات اتصال الطوارئ:',
        '',
        '• أضف على الأقل شخصاً واحداً كجهة اتصال أولية في قسم "الملف الشخصي ← جهات اتصال الطوارئ".',
        '• يمكنك أيضاً إضافة رقم المستشفى وطبيبك المعالج.',
        '• في حالات الطوارئ سيستطيع المارّون أو المسعفون الوصول لرقم الطوارئ من شاشة القفل (إن فعّلت ذلك).',
        '',
        'تأكد من أن أرقام الطوارئ محدّثة (رقم الطوارئ المحلي، أقرب مستشفى، شخص قريب).',
        '',
        '— (وضع عدم الاتصال.)',
      ].join('\n')
    : [
        '📞 Emergency contacts:',
        '',
        '• Add at least one primary emergency contact under "Profile ← Emergency Contacts".',
        '• You can also store your hospital and treating doctor\'s phone numbers.',
        '• In an emergency, bystanders or paramedics can reach your ICE (In Case of Emergency) number from the lock screen if you enable it.',
        '',
        'Make sure your emergency numbers are up to date (local emergency line, nearest hospital, a close family member).',
        '',
        '— (Offline mode.)',
      ].join('\n');
}

function buildProfileResponse(arabic: boolean): string {
  return arabic
    ? [
        '👤 ملفك الطبي:',
        '',
        '• الملف الطبي الكامل يساعد المسعفين والأطباء على اتخاذ قرارات أسرع وأكثر أماناً في الطوارئ.',
        '• أكمل: المعلومات الأساسية، الحساسيات، الأدوية الحالية، الحالات المزمنة، فصيلة الدم، جهة اتصال الطوارئ.',
        '• يمكنك إكمال الملف من قسم "الملف الشخصي".',
        '',
        'كلما ارتفعت نسبة اكتمال الملف، كانت الاستجابة في الطوارئ أكثر فعالية.',
        '',
        '— (وضع عدم الاتصال.)',
      ].join('\n')
    : [
        '👤 Your medical profile:',
        '',
        '• A complete medical profile helps paramedics and doctors make faster, safer decisions in emergencies.',
        '• Fill in: basic info, allergies, current medications, chronic conditions, blood type, emergency contact.',
        '• You can complete it under the "Profile" tab.',
        '',
        'The higher your profile completion, the more effective emergency response can be.',
        '',
        '— (Offline mode.)',
      ].join('\n');
}

function buildGreetingResponse(arabic: boolean): string {
  return arabic
    ? [
        'مرحباً 👋 أنا رفيق، مساعدك الصحي.',
        '',
        'يمكنني مساعدتك في:',
        '• تذكير الأدوية ومتابعة الجرعات',
        '• قراءة وتفسير قراءاتك الحيوية (نبض، ضغط، أكسجين، حرارة)',
        '• نصائح حول النوم والتغذية والراحة',
        '• استدعاء جهات اتصال الطوارئ عند الحاجة',
        '',
        'كيف يمكنني مساعدتك اليوم؟',
        '',
        '— (وضع عدم الاتصال: خدمة الذكاء الاصطناعي عن بُعد غير متاحة حالياً، لكنني ما زلت هنا لمساعدتك.)',
      ].join('\n')
    : [
        'Hello 👋 I\'m Rafiq, your health assistant.',
        '',
        'I can help you with:',
        '• Medication reminders and dose tracking',
        '• Reading and explaining your vitals (heart rate, BP, SpO₂, temperature)',
        '• Tips on sleep, nutrition, and rest',
        '• Reaching emergency contacts when needed',
        '',
        'How can I help you today?',
        '',
        '— (Offline mode: the remote AI service is unavailable right now, but I\'m still here to help.)',
      ].join('\n');
}

function buildThanksResponse(arabic: boolean): string {
  return arabic
    ? 'عفواً 🙏 سعيد بمساعدتك. اعتنِ بنفسك، ولا تتردد في العودة متى احتجتني.\n\n— (وضع عدم الاتصال.)'
    : 'You\'re welcome 🙏 happy to help. Take care of yourself, and come back any time.\n\n— (Offline mode.)';
}

function buildHelpResponse(arabic: boolean): string {
  return arabic
    ? [
        'ℹ️ عن رفيق:',
        '',
        'أنا مساعدك الصحي الشخصي. أستطيع:',
        '',
        '1. الإجابة عن أسئلتك الصحية العامة (أدوية، قراءات حيوية، نوم، تغذية).',
        '2. تذكيرك بمواعيد أدويتك (فعّل التذكيرات من قسم الأدوية).',
        '3. تنبيهك عند اكتشاف حالة طارئة في رسالتك وتوجيهك للطوارئ.',
        '4. حفظ ملفك الطبي وجهات اتصال الطوارئ ليصل إليها المسعفون عند الحاجة.',
        '',
        'اكتب سؤالك بالعربية أو الإنجليزية وسأرد عليك.',
        '',
        '⚠️ أنا لست بديلاً عن الطبيب. الحالات الطارئة يجب أن تُعالج عبر الاتصال بخدمات الطوارئ مباشرة.',
        '— (وضع عدم الاتصال.)',
      ].join('\n')
    : [
        'ℹ️ About Rafiq:',
        '',
        'I\'m your personal health assistant. I can:',
        '',
        '1. Answer general health questions (medications, vitals, sleep, nutrition).',
        '2. Remind you about medication times (enable reminders in the Medications tab).',
        '3. Detect possible emergencies in your message and direct you to emergency services.',
        '4. Store your medical profile and emergency contacts so paramedics can reach them when needed.',
        '',
        'Type your question in Arabic or English and I\'ll respond.',
        '',
        '⚠️ I am NOT a substitute for a doctor. Emergencies must be handled by calling emergency services directly.',
        '— (Offline mode.)',
      ].join('\n');
}

function buildDefaultResponse(arabic: boolean): string {
  return arabic
    ? [
        'أفهم أنك تسأل عن موضوع صحي. للأسف خدمة الذكاء الاصطناعي الكاملة غير متاحة حالياً، لذا سأعطيك إجابة عامة:',
        '',
        '• صِف أعراضك بدقة: متى بدأت؟ ما شدتها؟ هل تتفاقم؟',
        '• اذكر الأدوية الحالية والحساسيات إن وُجدت.',
        '• إن كانت الحالة طارئة (ألم صدر، صعوبة تنفس، نزيف شديد، فقدان وعي) — اتصل بالطوارئ فوراً.',
        '',
        'يمكنك أيضاً تجربة أحد المواضيع التالية: "أدوية"، "نبض القلب"، "ضغط الدم"، "الأكسجين"، "الحرارة"، "النوم"، "تغذية"، "ملف طبي".',
        '',
        '⚠️ للحصول على تشخيص أو خطة علاج، راجع طبيباً مرخّصاً.',
        '— (وضع عدم الاتصال — عذراً على الردود المحدودة.)',
      ].join('\n')
    : [
        'I understand you\'re asking about a health topic. Unfortunately the full AI service is unavailable right now, so here is a general reply:',
        '',
        '• Describe your symptoms precisely: when did they start? how severe? getting worse?',
        '• Mention current medications and any allergies.',
        '• If this is an emergency (chest pain, trouble breathing, severe bleeding, loss of consciousness) — call emergency services now.',
        '',
        'You can also try one of these topics: "medication", "heart rate", "blood pressure", "oxygen", "temperature", "sleep", "food", "profile".',
        '',
        '⚠️ For a diagnosis or treatment plan, please consult a licensed healthcare professional.',
        '— (Offline mode — apologies for the limited responses.)',
      ].join('\n');
}

function buildEmptyResponse(arabic: boolean): string {
  return arabic
    ? 'مرحباً 👋 كيف يمكنني مساعدتك اليوم؟\n\n— (وضع عدم الاتصال.)'
    : 'Hello 👋 how can I help you today?\n\n— (Offline mode.)';
}

export function generateLocalResponse(userMessage: string): LocalAIResponse {
  const message = (userMessage ?? '').toString();

  if (!message.trim()) {
    const arabic = isArabic(message) || false;
    return {
      content: buildEmptyResponse(arabic),
      provider: PROVIDER,
      model: MODEL,
      finishReason: FINISH_REASON,
    };
  }

  const arabic = isArabic(message);

  if (isEmergency(message, arabic)) {
    return {
      content: buildEmergencyResponse(arabic),
      provider: PROVIDER,
      model: MODEL,
      finishReason: FINISH_REASON,
    };
  }

  const topic = detectTopic(message, arabic);

  let content: string;
  switch (topic) {
    case 'medication':          content = buildMedicationResponse(arabic); break;
    case 'vitals_heart':        content = buildHeartRateResponse(arabic); break;
    case 'vitals_bp':           content = buildBloodPressureResponse(arabic); break;
    case 'vitals_oxygen':       content = buildOxygenResponse(arabic); break;
    case 'vitals_temp':         content = buildTemperatureResponse(arabic); break;
    case 'fever':               content = buildFeverResponse(arabic); break;
    case 'sleep':               content = buildSleepResponse(arabic); break;
    case 'food':                content = buildFoodResponse(arabic); break;
    case 'emergency_contacts':  content = buildEmergencyContactsResponse(arabic); break;
    case 'profile':             content = buildProfileResponse(arabic); break;
    case 'greeting':            content = buildGreetingResponse(arabic); break;
    case 'thanks':              content = buildThanksResponse(arabic); break;
    case 'help':                content = buildHelpResponse(arabic); break;
    case 'unknown':
    default:                    content = buildDefaultResponse(arabic); break;
  }

  return {
    content,
    provider: PROVIDER,
    model: MODEL,
    finishReason: FINISH_REASON,
  };
}

export default generateLocalResponse;
