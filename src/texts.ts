// Все ответы бота на трёх языках. Язык выбирается командой /language

export type Language = "ru" | "kk" | "en";

// Русские тексты задают список фраз: в kk и en TypeScript потребует те же самые
const ru = {
	// приветствие и кнопки
	greeting: (name: string | undefined) =>
		`${name === undefined ? "Привет!" : `Привет, ${name}!`} 👋\n\nЯ - Promise Bot!\n\nУ меня есть интересные функции. Что выберешь?`,
	ratesButton: "💱 Обмен валют",
	weatherButton: "🌤 Погода",
	countryButton: "🌍 Информация о странах",
	menuButton: "🏠 Меню",
	otherCountryButton: "🌍 Другая страна",
	unknownButton: "Не знаю такую кнопку.",
	failed: (reason: string) => `Не получилось: ${reason}`,

	// подсказки, когда команду прислали без значения или с неподходящим значением
	cityPrompt: "Напиши /city и свой город",
	namePrompt: "Напиши /name и своё имя (не длиннее 50 символов)",
	languagePrompt: "Напиши /language и выбери: ru, kk или en",
	agePrompt: "Напиши /age и свой возраст (число от 1 до 120)",
	myCountryPrompt: "Напиши /country и свою страну",

	// ответы на команды настройки
	citySaved: (city: string) => `Запомнил город: ${city}`,
	nameSaved: (name: string) => `Запомнил имя: ${name}`,
	languageSaved: "Запомнил язык: русский",
	ageSaved: (age: number) => `Запомнил возраст: ${age}`,
	countrySaved: (country: string) => `Запомнил страну: ${country}`,
	cityNotFound: "Такой город не нашёл. Проверьте название и попробуйте ещё раз.",
	countryNotFound: "Такую страну не нашёл. Проверьте название и попробуйте ещё раз.",

	// погода, валюты, страны
	weather: (city: string, temperature: number, wind: number) =>
		`🌤 ${city}: сейчас ${temperature} °C, ветер ${wind} м/с`,
	// этот текст бот просит ответить на него; по нему же узнаём, что пользователь прислал страну
	countryQuestion: "🌍 Напишите название страны, например: Казахстан",
	countryPlaceholder: "Название страны",
	countryAmbiguous: "Таких статей несколько, уточните название страны.",
	readMore: "Читать в Википедии",
	ratesDate: (date: string) => `Курс на ${date}`,
	ratesUnit: "(тенге за 1 единицу):",
	noRate: "курса нет",
	currencies: { USD: "доллар", EUR: "евро", RUB: "рубль", CNY: "юань" },

	// Promise.race
	raceTitle: "кто ответит быстрее?",
	raceWinner: (name: string, ms: number) => `🏆 Победитель: ${name} — ${ms} мс`,
	raceAll: "Все участники:",
	raceWeather: "погода",
	raceRates: "курсы",
	raceCountries: "страны",
	ms: "мс",

	// профиль
	profileTitle: "Ваш профиль",
	profileName: "Имя",
	profileLanguage: "Язык",
	profileAge: "Возраст",
	profileCountry: "Страна",
	profileCity: "Город для погоды",
	languageName: "русский",
	notSet: (command: string) => `не указано (${command})`,
};

export type Texts = typeof ru;

const kk: Texts = {
	greeting: (name) =>
		`${name === undefined ? "Сәлем!" : `Сәлем, ${name}!`} 👋\n\nМен — Promise Bot!\n\nМенде қызықты функциялар бар. Қайсысын таңдайсың?`,
	ratesButton: "💱 Валюта бағамы",
	weatherButton: "🌤 Ауа райы",
	countryButton: "🌍 Елдер туралы ақпарат",
	menuButton: "🏠 Мәзір",
	otherCountryButton: "🌍 Басқа ел",
	unknownButton: "Мұндай батырма жоқ.",
	failed: (reason) => `Орындалмады: ${reason}`,

	cityPrompt: "/city командасын және қалаңды жаз",
	namePrompt: "/name командасын және атыңды жаз (50 таңбадан аспасын)",
	languagePrompt: "/language командасын жазып, тілді таңда: ru, kk немесе en",
	agePrompt: "/age командасын және жасыңды жаз (1 мен 120 аралығындағы сан)",
	myCountryPrompt: "/country командасын және еліңді жаз",

	citySaved: (city) => `Қала сақталды: ${city}`,
	nameSaved: (name) => `Есім сақталды: ${name}`,
	languageSaved: "Тіл сақталды: қазақ тілі",
	ageSaved: (age) => `Жас сақталды: ${age}`,
	countrySaved: (country) => `Ел сақталды: ${country}`,
	cityNotFound: "Мұндай қала табылмады. Атауын тексеріп, қайта жазып көр.",
	countryNotFound: "Мұндай ел табылмады. Атауын тексеріп, қайта жазып көр.",

	weather: (city, temperature, wind) => `🌤 ${city}: қазір ${temperature} °C, жел ${wind} м/с`,
	countryQuestion: "🌍 Ел атауын жазыңыз, мысалы: Қазақстан",
	countryPlaceholder: "Ел атауы",
	countryAmbiguous: "Бірнеше мақала табылды, ел атауын нақтылаңыз.",
	readMore: "Уикипедиядан оқу",
	ratesDate: (date) => `Бағам уақыты: ${date}`,
	ratesUnit: "(1 бірлік үшін теңге):",
	noRate: "бағам жоқ",
	currencies: { USD: "доллар", EUR: "еуро", RUB: "рубль", CNY: "юань" },

	raceTitle: "кім жылдам жауап береді?",
	raceWinner: (name, ms) => `🏆 Жеңімпаз: ${name} — ${ms} мс`,
	raceAll: "Барлық қатысушылар:",
	raceWeather: "ауа райы",
	raceRates: "бағамдар",
	raceCountries: "елдер",
	ms: "мс",

	profileTitle: "Сіздің профиліңіз",
	profileName: "Есім",
	profileLanguage: "Тіл",
	profileAge: "Жас",
	profileCountry: "Ел",
	profileCity: "Ауа райы көрсетілетін қала",
	languageName: "қазақ тілі",
	notSet: (command) => `көрсетілмеген (${command})`,
};

const en: Texts = {
	greeting: (name) =>
		`${name === undefined ? "Hi!" : `Hi, ${name}!`} 👋\n\nI'm Promise Bot!\n\nI have some fun features. What will you choose?`,
	ratesButton: "💱 Exchange rates",
	weatherButton: "🌤 Weather",
	countryButton: "🌍 About countries",
	menuButton: "🏠 Menu",
	otherCountryButton: "🌍 Another country",
	unknownButton: "I don't know this button.",
	failed: (reason) => `Something went wrong: ${reason}`,

	cityPrompt: "Type /city and your city",
	namePrompt: "Type /name and your name (up to 50 characters)",
	languagePrompt: "Type /language and choose: ru, kk or en",
	agePrompt: "Type /age and your age (a number from 1 to 120)",
	myCountryPrompt: "Type /country and your country",

	citySaved: (city) => `City saved: ${city}`,
	nameSaved: (name) => `Name saved: ${name}`,
	languageSaved: "Language saved: English",
	ageSaved: (age) => `Age saved: ${age}`,
	countrySaved: (country) => `Country saved: ${country}`,
	cityNotFound: "I couldn't find that city. Check the name and try again.",
	countryNotFound: "I couldn't find that country. Check the name and try again.",

	weather: (city, temperature, wind) => `🌤 ${city}: now ${temperature} °C, wind ${wind} m/s`,
	countryQuestion: "🌍 Type a country name, for example: Kazakhstan",
	countryPlaceholder: "Country name",
	countryAmbiguous: "There are several articles, please be more specific.",
	readMore: "Read on Wikipedia",
	ratesDate: (date) => `Rates as of ${date}`,
	ratesUnit: "(tenge per 1 unit):",
	noRate: "no rate",
	currencies: { USD: "dollar", EUR: "euro", RUB: "ruble", CNY: "yuan" },

	raceTitle: "who answers first?",
	raceWinner: (name, ms) => `🏆 Winner: ${name} — ${ms} ms`,
	raceAll: "All runners:",
	raceWeather: "weather",
	raceRates: "rates",
	raceCountries: "countries",
	ms: "ms",

	profileTitle: "Your profile",
	profileName: "Name",
	profileLanguage: "Language",
	profileAge: "Age",
	profileCountry: "Country",
	profileCity: "Weather city",
	languageName: "English",
	notSet: (command) => `not set (${command})`,
};

export const texts: Record<Language, Texts> = { ru, kk, en };
