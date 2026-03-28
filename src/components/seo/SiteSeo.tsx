import { useEffect } from "react";
import type { UiLocale } from "../avatar/shared";

const SITE_URL = "https://avatars.metasiberia.com/";
const PREVIEW_IMAGE_PATH = "/local-assets/presets/female/preset-1.png";
const SITE_NAME = "Avatars Metasiberia";

type SiteSeoCopy = {
  title: string;
  description: string;
  introTitle: string;
  introText: string;
  creatorText: string;
  searchHint: string;
  featureList: readonly string[];
  searchTerms: readonly string[];
  keywords: string;
  htmlLang: string;
  ogLocale: string;
  imageAlt: string;
};

export const SITE_SEO_COPY: Record<UiLocale, SiteSeoCopy> = {
  ru: {
    title: "Avatars Metasiberia by Denis Shipilov Art, 3D конструктор аватаров",
    description:
      "Avatars Metasiberia by Denis Shipilov Art: создавайте 3D-аватары для Metasiberia, настраивайте одежду, лицо и текстуры, затем экспортируйте модель в GLB.",
    introTitle: "Avatars Metasiberia, конструктор 3D-аватаров",
    introText:
      "Avatars Metasiberia помогает собрать 3D-аватар для Metasiberia: выбирайте базу, одежду, волосы, черты лица, декали и свои текстуры, затем экспортируйте модель в GLB.",
    creatorText:
      "Проект создан Denis Shipilov Art и связан с именами Denis Shipilov, denshipilov и denshipilovart.",
    searchHint:
      "Искать сайт можно по запросам avatars.metasiberia.com, avatars.metasiberia, avatars, metasiberia, denshipilov, denshipilovart и Denis Shipilov Art.",
    featureList: [
      "База и пол",
      "Одежда и аксессуары",
      "Декали и UV-текстуры",
      "Экспорт GLB",
    ],
    searchTerms: [
      "avatars.metasiberia.com",
      "avatars.metasiberia",
      "avatars",
      "metasiberia",
      "denshipilov",
      "denshipilovart",
      "Denis Shipilov Art",
    ],
    keywords:
      "avatars.metasiberia.com, avatars.metasiberia, avatars metasiberia, metasiberia avatars, metasiberia, avatars, denshipilov, denshipilovart, Denis Shipilov Art, 3D аватар, конструктор аватаров, редактор аватаров, GLB, Ready Player Me",
    htmlLang: "ru",
    ogLocale: "ru_RU",
    imageAlt: "Предпросмотр конструктора 3D-аватаров Avatars Metasiberia",
  },
  en: {
    title: "Avatars Metasiberia by Denis Shipilov Art, 3D avatar creator",
    description:
      "Avatars Metasiberia by Denis Shipilov Art lets you create 3D avatars for Metasiberia with presets, clothing, facial features, textures, and GLB export.",
    introTitle: "Avatars Metasiberia, 3D avatar creator",
    introText:
      "Avatars Metasiberia lets you build a 3D avatar for Metasiberia with presets, clothing, hair, facial features, decals, and custom textures, then export the final model as GLB.",
    creatorText:
      "The project is created by Denis Shipilov Art and is connected with Denis Shipilov, denshipilov, and denshipilovart.",
    searchHint:
      "You can search this site by avatars.metasiberia.com, avatars.metasiberia, avatars, metasiberia, denshipilov, denshipilovart, and Denis Shipilov Art.",
    featureList: [
      "Presets and gender",
      "Clothing and accessories",
      "Decals and UV textures",
      "GLB export",
    ],
    searchTerms: [
      "avatars.metasiberia.com",
      "avatars.metasiberia",
      "avatars",
      "metasiberia",
      "denshipilov",
      "denshipilovart",
      "Denis Shipilov Art",
    ],
    keywords:
      "avatars.metasiberia.com, avatars.metasiberia, avatars metasiberia, metasiberia avatars, metasiberia, avatars, denshipilov, denshipilovart, Denis Shipilov Art, 3D avatar creator, character creator, GLB avatar, Ready Player Me",
    htmlLang: "en",
    ogLocale: "en_US",
    imageAlt: "Preview of the Avatars Metasiberia 3D avatar creator",
  },
};

const toAbsoluteUrl = (path: string) => new URL(path, SITE_URL).toString();

const setMetaTag = (
  attributeName: "name" | "property",
  attributeValue: string,
  content: string
) => {
  let element = document.head.querySelector(
    `meta[${attributeName}="${attributeValue}"]`
  ) as HTMLMetaElement | null;

  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attributeName, attributeValue);
    document.head.append(element);
  }

  element.setAttribute("content", content);
};

const setCanonicalLink = (href: string) => {
  let element = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;

  if (!element) {
    element = document.createElement("link");
    element.setAttribute("rel", "canonical");
    document.head.append(element);
  }

  element.setAttribute("href", href);
};

const setStructuredData = (value: unknown) => {
  let element = document.getElementById("metasiberia-site-jsonld") as HTMLScriptElement | null;

  if (!element) {
    element = document.createElement("script");
    element.id = "metasiberia-site-jsonld";
    element.type = "application/ld+json";
    document.head.append(element);
  }

  element.textContent = JSON.stringify(value);
};

export function SiteSeo({ locale }: { locale: UiLocale }) {
  useEffect(() => {
    const copy = SITE_SEO_COPY[locale];
    const imageUrl = toAbsoluteUrl(PREVIEW_IMAGE_PATH);

    document.title = copy.title;
    document.documentElement.lang = copy.htmlLang;

    setCanonicalLink(SITE_URL);
    setMetaTag("name", "description", copy.description);
    setMetaTag(
      "name",
      "robots",
      "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"
    );
    setMetaTag("name", "keywords", copy.keywords);
    setMetaTag("name", "theme-color", "#00d9e8");
    setMetaTag("property", "og:type", "website");
    setMetaTag("property", "og:site_name", SITE_NAME);
    setMetaTag("property", "og:locale", copy.ogLocale);
    setMetaTag("property", "og:title", copy.title);
    setMetaTag("property", "og:description", copy.description);
    setMetaTag("property", "og:url", SITE_URL);
    setMetaTag("property", "og:image", imageUrl);
    setMetaTag("property", "og:image:alt", copy.imageAlt);
    setMetaTag("name", "twitter:card", "summary");
    setMetaTag("name", "twitter:title", copy.title);
    setMetaTag("name", "twitter:description", copy.description);
    setMetaTag("name", "twitter:image", imageUrl);

    setStructuredData({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebSite",
          name: SITE_NAME,
          url: SITE_URL,
          description: copy.description,
          keywords: copy.keywords,
          creator: {
            "@type": "Organization",
            name: "Denis Shipilov Art",
            alternateName: "denshipilovart",
          },
          inLanguage: copy.htmlLang,
        },
        {
          "@type": "WebApplication",
          name: SITE_NAME,
          url: SITE_URL,
          applicationCategory: "DesignApplication",
          operatingSystem: "Any",
          description: copy.description,
          image: imageUrl,
          screenshot: imageUrl,
          featureList: copy.featureList,
          keywords: copy.keywords,
          creator: {
            "@type": "Person",
            name: "Denis Shipilov",
            alternateName: "denshipilov",
          },
          publisher: {
            "@type": "Organization",
            name: "Denis Shipilov Art",
            alternateName: "denshipilovart",
          },
          inLanguage: copy.htmlLang,
        },
      ],
    });
  }, [locale]);

  return null;
}
