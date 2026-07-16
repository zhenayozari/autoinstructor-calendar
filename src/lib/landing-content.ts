export type LandingTextItem = {
  title: string;
  text: string;
};

export type LandingSignal = {
  value: string;
  label: string;
};

export type LandingContent = {
  media: {
    logoUrl: string;
    logoAlt: string;
    heroImageUrl: string;
    heroImageAlt: string;
  };
  hero: {
    enabled: boolean;
    label: string;
    title: string;
    text: string;
    signals: LandingSignal[];
  };
  result: {
    enabled: boolean;
    title: string;
    text: string;
    items: LandingTextItem[];
  };
  situations: {
    enabled: boolean;
    label: string;
    title: string;
    desktopText: string;
    mobileSummaryTitle: string;
    mobileSummaryText: string;
    items: LandingTextItem[];
  };
  approach: {
    enabled: boolean;
    label: string;
    title: string;
    text: string;
    chips: string[];
  };
  process: {
    enabled: boolean;
    label: string;
    title: string;
    steps: LandingTextItem[];
  };
  instructors: {
    enabled: boolean;
    label: string;
    title: string;
  };
  contacts: {
    enabled: boolean;
    label: string;
    title: string;
    text: string;
    phoneLabel: string;
    phoneHref: string;
    telegramLabel: string;
    telegramUrl: string;
    maxLabel: string;
    maxUrl: string;
  };
};

export const DEFAULT_LANDING_CONTENT: LandingContent = {
  media: {
    logoUrl: "",
    logoAlt: "Автоинструктор",
    heroImageUrl: "/landing-car.png",
    heroImageAlt: "Автомобиль в ночном городе",
  },
  hero: {
    enabled: true,
    label: "Умный подход к обучению",
    title: "Вождение без паники. Город, экзамен и уверенность за рулём.",
    text: "{name} помогает спокойно разобрать сложные места, увидеть свои ошибки и почувствовать контроль за рулём, даже если практики в автошколе оказалось мало.",
    signals: [
      {
        value: "Город",
        label: "реальные маршруты, повороты, поток и парковка",
      },
      {
        value: "Экзамен",
        label: "типовые ошибки и спокойное выполнение манёвров",
      },
      {
        value: "Уверенность",
        label: "практика под ваш уровень и темп",
      },
    ],
  },
  result: {
    enabled: true,
    title: "Что вы получаете",
    text: "Не “откатать часы”, а понять дорогу.",
    items: [
      {
        title: "Спокойствие в городе",
        text: "Учимся заранее видеть ситуацию, держать дистанцию и не теряться в потоке.",
      },
      {
        title: "Разбор ошибок",
        text: "Не просто едем маршрут, а разбираем, почему ошибка появилась и как её исправить.",
      },
      {
        title: "Подготовка к экзамену",
        text: "Повторяем сложные места, парковку, перестроения и типовые экзаменационные ситуации.",
      },
    ],
  },
  situations: {
    enabled: true,
    label: "Когда это нужно",
    title: "Когда хочется понимать дорогу, а не просто ездить.",
    desktopText:
      "Дополнительное занятие с инструктором помогает закрыть именно те ситуации, которые вызывают напряжение: плотный поток, парковка, экзаменационный маршрут, перестроения или страх перед самостоятельной поездкой.",
    mobileSummaryTitle: "Зачем брать доп. занятие?",
    mobileSummaryText:
      "Чтобы спокойно разобрать ситуации, которые вызывают напряжение: поток, парковку, экзаменационный маршрут, перестроения или страх перед самостоятельной поездкой.",
    items: [
      {
        title: "Мало практики в автошколе",
        text: "Добираем часы и уверенность без ощущения, что нужно всё успеть за одно занятие.",
      },
      {
        title: "Страшно ехать самостоятельно",
        text: "Постепенно привыкаем к реальному городскому движению и сложным участкам.",
      },
      {
        title: "Скоро экзамен",
        text: "Фокусируемся на маршрутах, внимательности, парковке и спокойном выполнении манёвров.",
      },
      {
        title: "Нужно восстановить навык",
        text: "Возвращаем уверенность после перерыва и убираем тревогу перед дорогой.",
      },
    ],
  },
  approach: {
    enabled: true,
    label: "Подход",
    title: "Ошибки не пугают, если понятно, почему они появляются.",
    text: "На занятии важно не только проехать маршрут. Важно понять, куда смотреть, когда принимать решение, как держать дистанцию и как действовать спокойно в момент, когда вокруг много машин.",
    chips: ["Без давления", "Реальные маршруты", "Понятный разбор"],
  },
  process: {
    enabled: true,
    label: "Как проходит занятие",
    title: "Сначала цель, потом маршрут, потом спокойная практика.",
    steps: [
      {
        title: "Диагностика",
        text: "Коротко обсуждаем вашу цель, опыт и то, что сейчас мешает чувствовать себя уверенно.",
      },
      {
        title: "План занятия",
        text: "Выбираем маршрут и задачи: город, экзамен, парковка, перестроения или сложные перекрёстки.",
      },
      {
        title: "Практика в движении",
        text: "Едем в спокойном темпе, разбираем решения и закрепляем правильные действия.",
      },
      {
        title: "Понятный итог",
        text: "После занятия ясно, что уже получается и что стоит отработать дальше.",
      },
    ],
  },
  instructors: {
    enabled: true,
    label: "Инструктор",
    title: "Человек, с которым спокойно учиться.",
  },
  contacts: {
    enabled: true,
    label: "Контакты",
    title: "Хотите понять, подойдёт ли вам занятие?",
    text: "Напишите или позвоните. Можно коротко описать ситуацию: учитесь в автошколе, готовитесь к экзамену, боитесь города или хотите восстановить навык после перерыва.",
    phoneLabel: "+7 999 123-45-67",
    phoneHref: "tel:+79991234567",
    telegramLabel: "Telegram",
    telegramUrl: "#contacts",
    maxLabel: "Max",
    maxUrl: "#contacts",
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function readBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function readItems(value: unknown, fallback: LandingTextItem[]) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  return fallback.map((item, index) => {
    const source = isRecord(value[index]) ? value[index] : {};

    return {
      title: readString(source.title, item.title),
      text: readString(source.text, item.text),
    };
  });
}

function readSignals(value: unknown, fallback: LandingSignal[]) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  return fallback.map((item, index) => {
    const source = isRecord(value[index]) ? value[index] : {};

    return {
      value: readString(source.value, item.value),
      label: readString(source.label, item.label),
    };
  });
}

function readStrings(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  return fallback.map((item, index) => readString(value[index], item));
}

export function normalizeLandingContent(value: unknown): LandingContent {
  const source = isRecord(value) ? value : {};
  const hero = isRecord(source.hero) ? source.hero : {};
  const media = isRecord(source.media) ? source.media : {};
  const result = isRecord(source.result) ? source.result : {};
  const situations = isRecord(source.situations) ? source.situations : {};
  const approach = isRecord(source.approach) ? source.approach : {};
  const process = isRecord(source.process) ? source.process : {};
  const instructors = isRecord(source.instructors) ? source.instructors : {};
  const contacts = isRecord(source.contacts) ? source.contacts : {};

  return {
    media: {
      logoUrl: readString(media.logoUrl, DEFAULT_LANDING_CONTENT.media.logoUrl),
      logoAlt: readString(media.logoAlt, DEFAULT_LANDING_CONTENT.media.logoAlt),
      heroImageUrl: readString(
        media.heroImageUrl,
        DEFAULT_LANDING_CONTENT.media.heroImageUrl,
      ),
      heroImageAlt: readString(
        media.heroImageAlt,
        DEFAULT_LANDING_CONTENT.media.heroImageAlt,
      ),
    },
    hero: {
      enabled: readBoolean(hero.enabled, DEFAULT_LANDING_CONTENT.hero.enabled),
      label: readString(hero.label, DEFAULT_LANDING_CONTENT.hero.label),
      title: readString(hero.title, DEFAULT_LANDING_CONTENT.hero.title),
      text: readString(hero.text, DEFAULT_LANDING_CONTENT.hero.text),
      signals: readSignals(
        hero.signals,
        DEFAULT_LANDING_CONTENT.hero.signals,
      ),
    },
    result: {
      enabled: readBoolean(
        result.enabled,
        DEFAULT_LANDING_CONTENT.result.enabled,
      ),
      title: readString(result.title, DEFAULT_LANDING_CONTENT.result.title),
      text: readString(result.text, DEFAULT_LANDING_CONTENT.result.text),
      items: readItems(result.items, DEFAULT_LANDING_CONTENT.result.items),
    },
    situations: {
      enabled: readBoolean(
        situations.enabled,
        DEFAULT_LANDING_CONTENT.situations.enabled,
      ),
      label: readString(
        situations.label,
        DEFAULT_LANDING_CONTENT.situations.label,
      ),
      title: readString(
        situations.title,
        DEFAULT_LANDING_CONTENT.situations.title,
      ),
      desktopText: readString(
        situations.desktopText,
        DEFAULT_LANDING_CONTENT.situations.desktopText,
      ),
      mobileSummaryTitle: readString(
        situations.mobileSummaryTitle,
        DEFAULT_LANDING_CONTENT.situations.mobileSummaryTitle,
      ),
      mobileSummaryText: readString(
        situations.mobileSummaryText,
        DEFAULT_LANDING_CONTENT.situations.mobileSummaryText,
      ),
      items: readItems(
        situations.items,
        DEFAULT_LANDING_CONTENT.situations.items,
      ),
    },
    approach: {
      enabled: readBoolean(
        approach.enabled,
        DEFAULT_LANDING_CONTENT.approach.enabled,
      ),
      label: readString(approach.label, DEFAULT_LANDING_CONTENT.approach.label),
      title: readString(approach.title, DEFAULT_LANDING_CONTENT.approach.title),
      text: readString(approach.text, DEFAULT_LANDING_CONTENT.approach.text),
      chips: readStrings(
        approach.chips,
        DEFAULT_LANDING_CONTENT.approach.chips,
      ),
    },
    process: {
      enabled: readBoolean(
        process.enabled,
        DEFAULT_LANDING_CONTENT.process.enabled,
      ),
      label: readString(process.label, DEFAULT_LANDING_CONTENT.process.label),
      title: readString(process.title, DEFAULT_LANDING_CONTENT.process.title),
      steps: readItems(process.steps, DEFAULT_LANDING_CONTENT.process.steps),
    },
    instructors: {
      enabled: readBoolean(
        instructors.enabled,
        DEFAULT_LANDING_CONTENT.instructors.enabled,
      ),
      label: readString(
        instructors.label,
        DEFAULT_LANDING_CONTENT.instructors.label,
      ),
      title: readString(
        instructors.title,
        DEFAULT_LANDING_CONTENT.instructors.title,
      ),
    },
    contacts: {
      enabled: readBoolean(
        contacts.enabled,
        DEFAULT_LANDING_CONTENT.contacts.enabled,
      ),
      label: readString(contacts.label, DEFAULT_LANDING_CONTENT.contacts.label),
      title: readString(contacts.title, DEFAULT_LANDING_CONTENT.contacts.title),
      text: readString(contacts.text, DEFAULT_LANDING_CONTENT.contacts.text),
      phoneLabel: readString(
        contacts.phoneLabel,
        DEFAULT_LANDING_CONTENT.contacts.phoneLabel,
      ),
      phoneHref: readString(
        contacts.phoneHref,
        DEFAULT_LANDING_CONTENT.contacts.phoneHref,
      ),
      telegramLabel: readString(
        contacts.telegramLabel,
        DEFAULT_LANDING_CONTENT.contacts.telegramLabel,
      ),
      telegramUrl: readString(
        contacts.telegramUrl,
        DEFAULT_LANDING_CONTENT.contacts.telegramUrl,
      ),
      maxLabel: readString(
        contacts.maxLabel,
        DEFAULT_LANDING_CONTENT.contacts.maxLabel,
      ),
      maxUrl: readString(
        contacts.maxUrl,
        DEFAULT_LANDING_CONTENT.contacts.maxUrl,
      ),
    },
  };
}
