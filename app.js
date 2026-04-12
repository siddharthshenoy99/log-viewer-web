(function () {
  "use strict";

  /** Bump when you ship a handoff ZIP or tag a review build (footer + About dialog). */
  const APP_VERSION = "1.2.0";

  const CHART_COLORS = [
    "#76b900",
    "#8fd630",
    "#c5e6a8",
    "#ff9f4a",
    "#00c896",
    "#e080ff",
    "#a8e063",
    "#ff6b6b",
  ];

  /** Localized MSInfo “default IPv4 gateway” column titles (see hasDnsOrInfrastructureHint). */
  const MSINFO_IPV4_GATEWAY_LABELS = Object.freeze([
    "Default Gateway",
    "Default IP Gateway",
    "IPv4 Default Gateway",
    "Gateway",
    "Шлюз IP по умолчанию",
    "Шлюз по умолчанию",
    "Основной шлюз",
    "Passerelle par défaut",
    "Passerelle d'accès par défaut",
    "Passerelle IPv4 par défaut",
    "Standardgateway",
    "Standaardgateway",
    "Standardgateway IPv4",
    "Standard-gateway",
    "Standardrouter",
    "Standardruter",
    "Standardruttare",
    "Standaard IPv4-gateway",
    "Standaard router",
    "Router",
    "Router par défaut",
    "Brána",
    "Výchozí brána",
    "Predvolená brána",
    "Brama domyślna",
    "Brama IPv4",
    "Poarta implicită",
    "Poarta de ieșire implicită",
    "Oletusyhdyskäytävä",
    "IPv4-yhdyskäytävä",
    "IPv4 oletusyhdyskäytävä",
    "Standard gateway",
    "IPv4 Default gateway",
    "IPv4-Standardgateway",
    "IPv4-standardgateway",
    "Yhdyskäytävä",
    "Yhdyskäytävän IP-osoite",
    "Varsayılan ağ geçidi",
    "Varsayılan ağ geçidi IPv4",
    "Προεπιλεγμένη πύλη",
    "Προεπιλεγμένη πύλη IPv4",
    "Puerta de enlace predeterminada",
    "Puerta de enlace predeterminada IPv4",
    "Gateway predefinito",
    "Gateway predefinito IPv4",
    "Porta de ligação predefinida",
    "Porta de entrada predefinida",
    "IPv4-gateway",
    "IPv4-router",
    "IP-router",
    "Vaikimisi lüüs",
    "Vaikimisi marsruutija",
    "Alapértelmezett átjáró",
    "Alapértelmezett átjáró IPv4",
    "IPv4 默认网关",
    "默认网关",
    "IPv4 預設閘道",
    "預設閘道",
    "IPv4 기본 게이트웨이",
    "기본 게이트웨이",
    "IPv4 デフォルト ゲートウェイ",
    "デフォルト ゲートウェイ",
    "البوابة الافتراضية",
    "البوابة الافتراضية لبروتوكول IPv4",
  ]);

  const MSINFO_DHCP_SERVER_LABELS = Object.freeze([
    "DHCP Server",
    "DHCP-сервер",
    "DHCP сервер",
    "Сервер DHCP",
    "Serveur DHCP",
    "DHCP-Server",
    "DHCP server",
    "DHCP-server",
    "Servidor DHCP",
    "Servidor de DHCP",
    "Serwer DHCP",
    "Server DHCP",
    "DHCP-palvelin",
    "DHCP-palvelimen osoite",
    "DHCP Sunucusu",
    "Sunucu DHCP",
    "Διακομιστής DHCP",
    "خادم DHCP",
    "DHCP 服务器",
    "DHCPサーバー",
    "DHCP サーバー",
    "DHCP 서버",
    "DHCP-kiszolgáló",
    "DHCP-kiszolgáló IPv4",
  ]);

  /** @param {string} s */
  function looksLikeUtf16MisreadAsUtf8(s) {
    const sample = s.slice(0, 2000);
    if (!sample.length) return false;
    const nul = (sample.match(/\x00/g) || []).length;
    return nul > sample.length * 0.05;
  }

  /** @param {string} s */
  function scoreGpuZLogText(s) {
    if (!s || s.length < 2) return -1e9;
    const head = s.slice(0, 2000);
    const lines = s.split(/\r?\n/).filter((ln) => ln.trim().length > 0);
    const firstLine = lines[0] || "";
    let score = 0;
    const rep = (s.match(/\uFFFD/g) || []).length;
    score -= rep * 25;
    const nuls = (head.match(/\x00/g) || []).length;
    score -= nuls * 8;
    if (/\bdate\b/i.test(head)) score += 40;
    if (/\bgpu\b/i.test(head)) score += 18;
    if (/\bmemory\b/i.test(head)) score += 12;
    if (/\bclock\b/i.test(head)) score += 12;
    if (/\bmhz\b/i.test(head)) score += 12;
    if (/\bload\b/i.test(head)) score += 10;
    if (/\bpower\b/i.test(head)) score += 10;
    if (/\btemperature\b|\btemp\b/i.test(head)) score += 10;
    if (/\bdriver\b|\bvoltage\b/i.test(head)) score += 8;
    if ((head.match(/,/g) || []).length >= 3) score += 22;
    let dateLike = 0;
    for (let i = 1; i < Math.min(lines.length, 40); i++) {
      if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(lines[i].trim())) dateLike++;
    }
    score += dateLike * 10;
    const cjk = (firstLine.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
    if (firstLine.length && cjk > firstLine.length * 0.12) score -= 80;
    const asciiPrint = (firstLine.match(/[\x20-\x7e]/g) || []).length;
    if (firstLine.length) score += (asciiPrint / firstLine.length) * 35;
    const weird = (firstLine.match(/[\u2020\u2021\uFFF0-\uFFFF]/g) || []).length;
    score -= weird * 15;
    return score;
  }

  /** @param {Uint8Array} u */
  function decodeGpuAutodetect(u) {
    /** @type {{ text: string, label: string, score: number }[]} */
    const cand = [];
    let utf8Strict = null;
    try {
      utf8Strict = new TextDecoder("utf-8", { fatal: true }).decode(u);
    } catch {
      utf8Strict = null;
    }
    const utf8Lax = new TextDecoder("utf-8", { fatal: false }).decode(u);
    const utf16le = new TextDecoder("utf-16le", { fatal: false }).decode(u);
    const utf16be = new TextDecoder("utf-16be", { fatal: false }).decode(u);
    const push = (text, label, penalty = 0) => {
      cand.push({ text, label, score: scoreGpuZLogText(text) - penalty });
    };
    if (utf8Strict !== null && !looksLikeUtf16MisreadAsUtf8(utf8Strict)) {
      push(utf8Strict, "UTF-8", 0);
    } else {
      push(utf8Lax, "UTF-8 (relaxed)", utf8Strict === null ? 0 : 3);
    }
    push(utf16le, "UTF-16 LE", 0);
    push(utf16be, "UTF-16 BE", 1);
    try {
      const cp1252 = new TextDecoder("windows-1252", { fatal: false }).decode(u);
      push(cp1252, "Windows-1252", 6);
    } catch {
      /* ignore */
    }
    cand.sort((a, b) => b.score - a.score);
    const best = cand[0];
    const utf8Candidate = cand.find((c) => c.label.startsWith("UTF-8"));
    if (
      utf8Candidate &&
      best.score - utf8Candidate.score <= 12 &&
      utf8Candidate.label === "UTF-8" &&
      best.label !== "UTF-8"
    ) {
      return { text: utf8Candidate.text, label: `${utf8Candidate.label} (auto)` };
    }
    return { text: best.text, label: `${best.label} (auto)` };
  }

  /**
   * Bytes after the UTF-16 BOM are not always UTF-16 LE; pick LE, BE, or UTF-8 by MSInfo plausibility score.
   * @param {Uint8Array} body
   * @param {'le' | 'be'} bomEndian BOM that was stripped from the original buffer
   */
  function decodeUtf16BomBodyWithBestGuess(body, bomEndian) {
    const le = stripLoneUtf16Surrogates(new TextDecoder("utf-16le").decode(body));
    const be = stripLoneUtf16Surrogates(new TextDecoder("utf-16be").decode(body));
    let u8 = "";
    try {
      u8 = stripLoneUtf16Surrogates(new TextDecoder("utf-8", { fatal: true }).decode(body));
    } catch {
      u8 = stripLoneUtf16Surrogates(new TextDecoder("utf-8", { fatal: false }).decode(body));
    }
    const rank = (/** @type {string} */ txt) => {
      const a = alignMsInfoDecodedTextToXmlStart(txt);
      return Math.max(scoreMsInfoDecodedText(a), scorePlainTextMsInfoExport(txt));
    };
    /** @type {{ t: string, k: "le" | "be" | "utf8"; s: number }[]} */
    const variants = [
      { t: le, k: "le", s: rank(le) },
      { t: be, k: "be", s: rank(be) },
      { t: u8, k: "utf8", s: rank(u8) },
    ];
    variants.sort((a, b) => b.s - a.s);
    const w = variants[0];
    let label = bomEndian === "le" ? "UTF-16 LE (BOM)" : "UTF-16 BE (BOM)";
    if (bomEndian === "le") {
      if (w.k === "be") label = "UTF-16 BE (auto — content matched better than LE)";
      else if (w.k === "utf8") label = "UTF-8 (auto — content matched better after LE BOM)";
    } else {
      if (w.k === "le") label = "UTF-16 LE (auto — content matched better than BE)";
      else if (w.k === "utf8") label = "UTF-8 (auto — content matched better after BE BOM)";
    }
    return { text: w.t, label };
  }

  /**
   * @param {ArrayBuffer} buf
   * @param {'system' | 'gpu'} panelKind
   * @param {string} encoding
   */
  function decodeBuffer(buf, panelKind, encoding) {
    const u = new Uint8Array(buf);
    if (encoding !== "auto") {
      const dec = new TextDecoder(encoding, { fatal: false });
      return { text: stripLoneUtf16Surrogates(dec.decode(u)), label: encoding };
    }
    if (u.length >= 2 && u[0] === 0xff && u[1] === 0xfe) {
      return decodeUtf16BomBodyWithBestGuess(u.subarray(2), "le");
    }
    if (u.length >= 2 && u[0] === 0xfe && u[1] === 0xff) {
      return decodeUtf16BomBodyWithBestGuess(u.subarray(2), "be");
    }
    if (u.length >= 3 && u[0] === 0xef && u[1] === 0xbb && u[2] === 0xbf) {
      return {
        text: stripLoneUtf16Surrogates(new TextDecoder("utf-8").decode(u.subarray(3))),
        label: "UTF-8 (BOM)",
      };
    }
    if (panelKind === "system") {
      return decodeSystemBufferAuto(u);
    }
    return decodeGpuAutodetect(u);
  }

  /**
   * Heuristic score: how much decoded text resembles an MSInfo XML export (used to pick encoding).
   * @param {string} s
   */
  function scoreMsInfoDecodedText(s) {
    const head = s.slice(0, Math.min(s.length, 250000));
    if (!head.trim()) return -1e9;
    let sc = 0;
    const rep = (head.match(/\uFFFD/g) || []).length;
    const nul = (head.match(/\x00/g) || []).length;
    sc -= rep * 40;
    sc -= nul * 14;
    const t = head.replace(/^\uFEFF/, "").trimStart();
    if (t.startsWith("<") || t.startsWith("<?xml")) sc += 14;
    if (/<MsInfo\b/i.test(head)) sc += 85;
    if (/<Category\b/i.test(head)) sc += 38;
    if (/<Data\b/i.test(head)) sc += 28;
    if (/<\/MsInfo\s*>/i.test(head)) sc += 22;
    /** msinfo32 “text” export (tab-separated, localized) — not XML */
    if (/システム情報の報告|システム情報\s*の\s*報告/.test(head)) sc += 52;
    if (/\[システムの要約\]/.test(head)) sc += 48;
    if (/項目\s*\t+\s*値/.test(head)) sc += 44;
    if (/system\s+information\s+(report|was\s+written)/i.test(head)) sc += 48;
    if (/\[\s*system\s+summary\s*\]/i.test(head)) sc += 42;
    if (/\bitem\s*\t+\s*value\b/i.test(head)) sc += 40;
    if (/\bItem\s*=/i.test(head) || /\bValue\s*=/i.test(head)) sc += 6;
    // \b is unreliable before CJK attribute names; allow leading whitespace or start.
    if (/(?:^|[\s,])項目\s*=/.test(head) || /(?:^|[\s,])値\s*=/.test(head)) sc += 10;
    return sc;
  }

  /**
   * Score decoded text as msinfo32 plain “text” export (tabs + [sections]), for encoding autodetect.
   * @param {string} s
   */
  function scorePlainTextMsInfoExport(s) {
    const head = s.slice(0, Math.min(500000, s.length));
    if (!head.includes("\t")) return -1e9;
    let sc = 0;
    if (/システム情報|システムの要約|システム名\s*:/.test(head)) sc += 70;
    if (/項目\s*\t+\s*値/.test(head)) sc += 55;
    if (/system\s+information\s+(report|was\s+written|saved)/i.test(head) || /\[\s*system\s+summary\s*\]/i.test(head))
      sc += 65;
    if (/\bitem\s*\t+\s*value\b/i.test(head)) sc += 50;
    const lines = head.split(/\r?\n/);
    let sections = 0;
    let tabRows = 0;
    for (const raw of lines) {
      const ln = raw.trim();
      if (/^\[[^\]\r\n]{1,200}\]\s*$/.test(ln)) sections++;
      if (!ln.includes("\t")) continue;
      const parts = ln.split("\t").filter((p) => String(p).trim().length);
      if (parts.length >= 2) tabRows++;
    }
    sc += Math.min(sections, 40) * 5;
    sc += Math.min(tabRows, 800);
    return sc;
  }

  /**
   * Pick the best decoding for MSInfo / system information bytes (UTF-8 vs UTF-16 vs Shift_JIS, etc.).
   * @param {Uint8Array} u
   * @returns {{ text: string, label: string }}
   */
  function decodeSystemBufferAuto(u) {
    /** @type {{ text: string, label: string, score: number }[]} */
    const cand = [];
    const push = (/** @type {string} */ text, /** @type {string} */ label) => {
      const cleaned = stripLoneUtf16Surrogates(text);
      const aligned = alignMsInfoDecodedTextToXmlStart(cleaned);
      cand.push({
        text: cleaned,
        label,
        score: Math.max(scoreMsInfoDecodedText(aligned), scorePlainTextMsInfoExport(cleaned)),
      });
    };
    let utf8Strict = null;
    try {
      utf8Strict = new TextDecoder("utf-8", { fatal: true }).decode(u);
    } catch {
      utf8Strict = null;
    }
    if (utf8Strict !== null && !looksLikeUtf16MisreadAsUtf8(utf8Strict)) {
      push(utf8Strict, "UTF-8");
    } else {
      push(new TextDecoder("utf-8", { fatal: false }).decode(u), "UTF-8 (relaxed)");
    }
    push(new TextDecoder("utf-16le", { fatal: false }).decode(u), "UTF-16 LE");
    push(new TextDecoder("utf-16be", { fatal: false }).decode(u), "UTF-16 BE");
    try {
      push(new TextDecoder("windows-1252", { fatal: false }).decode(u), "Windows-1252");
    } catch {
      /* ignore */
    }
    try {
      push(new TextDecoder("windows-31j", { fatal: false }).decode(u), "Windows-31J");
    } catch {
      /* ignore */
    }
    try {
      push(new TextDecoder("windows-949", { fatal: false }).decode(u), "Windows-949");
    } catch {
      /* ignore */
    }
    cand.sort((a, b) => b.score - a.score);
    let best = cand[0] || { text: "", label: "UTF-8 (auto)", score: -1e9 };
    const utf8Cand = cand.find((c) => c.label === "UTF-8" || c.label === "UTF-8 (relaxed)");
    if (
      utf8Cand &&
      utf8Cand.score >= 55 &&
      best.score - utf8Cand.score <= 22 &&
      !/^UTF-8/i.test(best.label) &&
      !/Windows-31J|Windows-949/i.test(best.label)
    ) {
      best = utf8Cand;
    }
    return { text: best.text, label: `${best.label} (auto)` };
  }

  /** @param {Element} el */
  function xmlText(el) {
    return (el.textContent || "").replace(/\s+/g, " ").trim();
  }

  /**
   * @param {Document} doc
   * @returns {{ kvs: { path: string, item: string, value: string }[], rows: { path: string, fields: Record<string, string> }[] }}
   */
  function walkMsInfo(doc) {
    /** @type {{ path: string, item: string, value: string }[]} */
    const kvs = [];
    /** @type {{ path: string, fields: Record<string, string> }[]} */
    const rows = [];

    /** MSInfo .nfo often uses localized column tag names (e.g. Russian Element/Value element names in XML). */
    const normXmlTag = (/** @type {string} */ name) => {
      try {
        return String(name || "").normalize("NFKC").toLowerCase();
      } catch {
        return String(name || "").toLowerCase();
      }
    };
    const msinfoDataChildIsItemLike = (/** @type {string} */ localName) => {
      const n = normXmlTag(localName);
      return /^(item|name|key|eintrag|property|элемент|elemento|élément|položka|pozycja|öğe|عنصر|στοιχείο|elementti|項目|名称|항목)$/u.test(
        n
      );
    };
    const msinfoDataChildIsValueLike = (/** @type {string} */ localName) => {
      const n = normXmlTag(localName);
      return /^(value|val|wert|data|inhalt|значение|valor|valeur|waarde|hodnota|wartość|arvo|érték|valoare|değer|قيمة|τιμή|值|数值|値|값|väärtus)$/u.test(
        n
      );
    };

    /** @param {Element} catEl @param {string[]} pathParts */
    function visitCategory(catEl, pathParts) {
      const nm =
        catEl.getAttribute("name") ||
        catEl.getAttribute("Name") ||
        catEl.getAttribute("名前") ||
        "";
      const path = nm ? [...pathParts, nm] : pathParts;
      for (const child of catEl.children) {
        const tag = child.localName;
        if (/^category$/i.test(tag)) {
          visitCategory(child, path);
        } else if (/^data$/i.test(tag)) {
          const pathStr = path.join(" / ");
          const kids = [...child.children];

          const attrItem =
            child.getAttribute("Item") ||
            child.getAttribute("item") ||
            child.getAttribute("Key") ||
            child.getAttribute("key") ||
            child.getAttribute("項目") ||
            child.getAttribute("名称") ||
            child.getAttribute("항목") ||
            child.getAttribute("Элемент");
          const attrVal =
            child.getAttribute("Value") ||
            child.getAttribute("value") ||
            child.getAttribute("Val") ||
            child.getAttribute("val") ||
            child.getAttribute("値") ||
            child.getAttribute("值") ||
            child.getAttribute("数值") ||
            child.getAttribute("값") ||
            child.getAttribute("Значение");
          if (attrItem != null && attrVal != null && (String(attrItem).trim() || String(attrVal).trim())) {
            const norm = (/** @type {string} */ s) => String(s || "").replace(/\s+/g, " ").trim();
            kvs.push({ path: pathStr, item: norm(attrItem), value: norm(attrVal) });
            continue;
          }

          const itemIdx = kids.findIndex((c) => msinfoDataChildIsItemLike(c.localName));
          const valIdx = kids.findIndex((c) => msinfoDataChildIsValueLike(c.localName));
          if (itemIdx >= 0 && valIdx >= 0) {
            kvs.push({
              path: pathStr,
              item: xmlText(kids[itemIdx]),
              value: xmlText(kids[valIdx]),
            });
            continue;
          }

          if (
            kids.length >= 2 &&
            msinfoDataChildIsItemLike(kids[0].localName) &&
            msinfoDataChildIsValueLike(kids[1].localName)
          ) {
            kvs.push({ path: pathStr, item: xmlText(kids[0]), value: xmlText(kids[1]) });
            continue;
          }

          const fields = {};
          for (const k of kids) {
            fields[k.localName] = xmlText(k);
          }
          if (Object.keys(fields).length) rows.push({ path: pathStr, fields });
        }
      }
    }

    const root = doc.documentElement;
    if (root && /^MsInfo$/i.test(root.localName)) {
      for (const child of root.children) {
        if (/^category$/i.test(child.localName)) visitCategory(child, []);
      }
    } else if (root) {
      visitCategory(root, []);
    }
    return { kvs, rows };
  }

  /**
   * Intel Windows DCH driver style — never treat as NVIDIA.
   * @param {string} s
   */
  function isIntelDriverVersionString(s) {
    return /\b32\.0\.101\.\d+/.test(s) || /\b10\.\d{1,2}\.\d{1,2}\.\d+/.test(s.trim());
  }

  /**
   * NVIDIA internal branch (GeForce / Studio / RTX) — xxx.yy conversion applies only here.
   * @param {string} s
   */
  function isNvidiaDriverVersionString(s) {
    if (!s || isIntelDriverVersionString(s)) return false;
    if (/\bAMD\b|Advanced Micro Devices|Radeon/i.test(s)) return false;
    return /\b3[12]\.0\.15\.\d{4,6}\b/.test(s) || /\b31\.0\.15\.\d{4,6}\b/.test(s);
  }

  /**
   * NVIDIA user-facing driver from internal quad, e.g. 32.0.15.8195 → 581.95 (last five digits).
   * Call only when isNvidiaDriverVersionString is true.
   * @param {string} driverStr
   */
  function nvidiaInternalToDisplayVersion(driverStr) {
    if (!driverStr) return "";
    const s = driverStr.trim();
    const quad = s.match(/\b(\d+)\.(\d+)\.(\d+)\.(\d+)\b/);
    const digitSource = quad ? quad[0] : s;
    const digits = digitSource.replace(/\D/g, "");
    if (digits.length < 5) return "";
    const last5 = digits.slice(-5);
    return `${last5.slice(0, 3)}.${last5.slice(3)}`;
  }

  /** @param {string} path */
  function isIntelGraphicsPath(path) {
    return (
      /Intel\(R\)|Intel®|Intel \(R\)|UHD Graphics|Iris|Arc\(TM\)|Arc ™|Intel Arc/i.test(path) &&
      !/NVIDIA/i.test(path)
    );
  }

  /** @param {string} path */
  function isNvidiaGraphicsPath(path) {
    return /NVIDIA|GeForce|RTX|Quadro|Tesla|nVIDIA/i.test(path);
  }

  /** @param {string} item */
  function isDriverVersionItem(item) {
    const it = String(item || "").trim();
    if (!it) return false;
    return (
      /^driver\s*version$/i.test(it) ||
      /^версия\s*драйвера$/i.test(it) ||
      /^ドライバー\s*の\s*バージョン$/i.test(it) ||
      /^ドライバーのバージョン$/i.test(it) ||
      /^ドライバのバージョン$/i.test(it) ||
      /^ドライバー\s*バージョン$/i.test(it) ||
      /^ドライバ\s*バージョン$/i.test(it)
    );
  }

  /** MSInfo localized “adapter name” row label (Item column). */
  function isDisplayNameItem(item) {
    const it = String(item || "").trim();
    return (
      /^name$/i.test(it) ||
      /^имя$/i.test(it) ||
      /^наименование$/i.test(it) ||
      /^名前$/i.test(it) ||
      /^名称$/i.test(it)
    );
  }

  /** @param {Record<string, string>} fields */
  function displayAdapterDisplayName(fields) {
    return (
      displayFieldByLabels(fields, ["Name", "Имя", "Наименование", "名前", "名称"]) ||
      String(fields.Name || fields.Имя || fields["Наименование"] || fields["名前"] || fields["名称"] || "").trim()
    );
  }

  /** MSInfo localized “resolution” row label. */
  function isResolutionItemLabel(item) {
    const it = String(item || "").trim();
    return (
      /^resolution$/i.test(it) ||
      /^current resolution$/i.test(it) ||
      /^разрешение$/i.test(it) ||
      /^解像度$/i.test(it) ||
      /^現在の解像度$/i.test(it) ||
      /^画面の解像度$/i.test(it)
    );
  }

  /**
   * MSInfo "Components > Display" lists Intel (32.0.101.x) and NVIDIA (32.0.15.x) on separate
   * rows. Prefer the value that matches the NVIDIA branch anywhere in the export.
   * @param {{ path: string, item: string, value: string }[]} kvs
   */
  function pickNvidiaDisplayDriverKvs(kvs) {
    const val = (/** @type {string} */ v) => (v || "").trim();
    const isIntelVer = (/** @type {string} */ v) => isIntelDriverVersionString(v);

    const excludedPath = (/** @type {string} */ p) =>
      /Network|Bluetooth|Audio|Printer|Keyboard|Mouse|Ethernet|Wi-?Fi|Wireless LAN|USB.*Audio|Storage|Disk|Controller\s*Host/i.test(
        p
      );

    /** @param {string} v */
    const hasNvidiaBranch = (v) => /\b3[12]\.0\.15\.\d{3,8}\b/.test(v) && !isIntelVer(v);

    const branchMatches = kvs.filter(
      (k) =>
        isDriverVersionItem(k.item) &&
        hasNvidiaBranch(val(k.value)) &&
        !excludedPath(k.path)
    );
    if (branchMatches.length === 1) return val(branchMatches[0].value);
    const onNvidiaPath = branchMatches.find((k) => isNvidiaGraphicsPath(k.path));
    if (onNvidiaPath) return val(onNvidiaPath.value);
    const onDisplayPath = branchMatches.find((k) => isMsInfoDisplayRelatedPath(k.path));
    if (onDisplayPath) return val(onDisplayPath.value);
    if (branchMatches.length > 0) return val(branchMatches[0].value);

    const candidates = kvs.filter((k) => {
      if (!isDriverVersionItem(k.item)) return false;
      if (/USB.*Audio|Sound Driver|Audio Device/i.test(k.path)) return false;
      if (excludedPath(k.path)) return false;
      const pl = k.path.toLowerCase();
      return isMsInfoDisplayRelatedPath(k.path) || /3d render/i.test(pl);
    });

    const by15 = candidates.find((k) => hasNvidiaBranch(val(k.value)));
    if (by15) return val(by15.value);

    const nameKv = kvs.find(
      (x) =>
        isDisplayNameItem(x.item) &&
        (/NVIDIA|GeForce|RTX|Quadro|Tesla/i.test(x.value) || /\bVEN_10DE\b/i.test(x.value))
    );
    if (nameKv) {
      const onNamePath = candidates.filter((k) => k.path === nameKv.path);
      const ok = onNamePath.find((k) => hasNvidiaBranch(val(k.value))) || onNamePath.find((k) => !isIntelVer(val(k.value)));
      if (ok) return val(ok.value);
    }

    const onNvidiaPath2 = candidates.find((k) => isNvidiaGraphicsPath(k.path) && !isIntelVer(val(k.value)));
    if (onNvidiaPath2) return val(onNvidiaPath2.value);

    return "";
  }

  /**
   * Column-style MSInfo rows (non Item/Value) under Display.
   * @param {{ path: string, fields: Record<string, string> }[]} rows
   */
  function pickNvidiaDriverFromRows(rows) {
    /** @param {Record<string, string>} f */
    function driverFromFields(f) {
      const dv =
        f["Driver Version"] ||
        f.DriverVersion ||
        f["Driver version"] ||
        f["Версия драйвера"] ||
        f["версия драйвера"] ||
        f["ドライバーのバージョン"] ||
        f["ドライバのバージョン"] ||
        f["ドライバー バージョン"] ||
        f["ドライバ バージョン"];
      return dv ? String(dv).trim() : "";
    }
    for (const r of rows) {
      if (!isMsInfoDisplayRelatedPath(r.path)) continue;
      const dv = driverFromFields(r.fields);
      if (!dv || !/\b3[12]\.0\.15\.\d+/.test(dv) || isIntelDriverVersionString(dv)) continue;
      const nm = `${displayAdapterDisplayName(r.fields)} ${r.path}`;
      if (/NVIDIA|GeForce|RTX|Quadro|Tesla/i.test(nm)) return dv;
    }
    for (const r of rows) {
      if (!isMsInfoDisplayRelatedPath(r.path)) continue;
      const dv = driverFromFields(r.fields);
      if (dv && /\b3[12]\.0\.15\.\d+/.test(dv) && !isIntelDriverVersionString(dv)) return dv;
    }
    return "";
  }

  /**
   * @param {{ path: string, fields: Record<string, string> }[]} rows
   * @param {'intel' | 'nvidia'} which
   */
  function resolutionFromDisplayRows(rows, which) {
    for (const r of rows) {
      if (!isMsInfoDisplayRelatedPath(r.path)) continue;
      const f = r.fields;
      const res = (
        f.Resolution ||
        f["Current Resolution"] ||
        f["Разрешение"] ||
        f["Текущее разрешение"] ||
        f["解像度"] ||
        f["現在の解像度"] ||
        f["画面の解像度"] ||
        ""
      ).trim();
      if (!res || /^not available|^недоступно$/i.test(res)) continue;
      const nm = `${displayAdapterDisplayName(f)} ${r.path}`;
      if (which === "nvidia" && /NVIDIA|GeForce|RTX|Quadro|Tesla/i.test(nm)) return res;
      if (which === "intel" && /Intel|UHD|Iris|Arc/i.test(nm) && !/NVIDIA/i.test(nm)) return res;
    }
    return "";
  }

  /**
   * @param {Record<string, string>} fields
   * @param {string[]} labels
   */
  function displayFieldByLabels(fields, labels) {
    if (!fields || typeof fields !== "object") return "";
    for (const lab of labels) {
      const escLab = lab.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`^${escLab}$`, "i");
      for (const [k, v] of Object.entries(fields)) {
        if (re.test(k.trim()) && v != null && String(v).trim()) return String(v).trim();
      }
    }
    return "";
  }

  /**
   * @param {string} path
   * @param {Map<string, Record<string, string>>} byPath
   * @param {{ path: string, fields: Record<string, string> }[]} rows
   */
  function mergePathFields(path, byPath, rows) {
    const o = path && byPath.has(path) ? { ...byPath.get(path) } : {};
    for (const r of rows) {
      if (r.path === path && r.fields) Object.assign(o, r.fields);
    }
    return o;
  }

  /** @param {string} pnp */
  function pnpToDeviceId(pnp) {
    const m = String(pnp || "").match(/VEN_([0-9A-F]{4})&DEV_([0-9A-F]{4})/i);
    return m ? `${m[1].toUpperCase()}:${m[2].toUpperCase()}` : "";
  }

  /** @param {string} id VEN:DEV (hex, e.g. 10DE:24B8) — opens PCILookup with fields prefilled */
  function pciLookupUrlFromDeviceId(id) {
    if (!id || !/^[0-9A-F]{4}:[0-9A-F]{4}$/i.test(id)) return "";
    const [v, d] = id.split(":");
    const ven = encodeURIComponent(v.toLowerCase());
    const dev = encodeURIComponent(d.toLowerCase());
    return `https://pcilookup.com/?ven=${ven}&dev=${dev}&action=submit`;
  }

  /** @param {string} path */
  function isMsInfoDisplayRelatedPath(path) {
    return (
      /Display|Monitor|Graphics|Video|VideoController|Videocontroller|Дисплей|Экран|Видео|Монитор|Видеоконтроллер|Видеоадапт|表示|ディスプレイ|グラフィック|グラフィックス|ビデオ|モニター|モニタ|ビデオアダプタ|ビデオ\s*コントローラ/i.test(
        path
      ) &&
      !/USB.*Audio|Sound Driver|Audio Device|Звук|аудио|オーディオ|サウンド/i.test(path)
    );
  }

  /**
   * MSInfo "Components > Display" often lists several adapters under one category path by repeating
   * rows like Name / PNP Device ID / Driver Version. Merging into one object per path overwrites
   * earlier adapters — split on each Name row instead.
   * @param {{ path: string, item: string, value: string }[]} kvs
   * @returns {{ path: string, fields: Record<string, string> }[]}
   */
  function segmentMsInfoDisplayKvs(kvs) {
    const flat = kvs.filter((k) => isMsInfoDisplayRelatedPath(k.path));
    /** @type {{ path: string, fields: Record<string, string> }[]} */
    const segments = [];
    /** @type {{ path: string, fields: Record<string, string> } | null} */
    let cur = null;

    for (const k of flat) {
      const itemTrim = (k.item || "").trim();
      if (isDisplayNameItem(itemTrim)) {
        if (cur && Object.keys(cur.fields).length > 0) segments.push(cur);
        cur = { path: k.path, fields: {} };
      } else if (!cur) {
        cur = { path: k.path, fields: {} };
      }
      cur.fields[itemTrim || k.item] = k.value;
      cur.path = k.path;
    }
    if (cur && Object.keys(cur.fields).length > 0) segments.push(cur);

    return segments.filter((s) => {
      const name = displayAdapterDisplayName(s.fields);
      const pnp = displayFieldByLabels(s.fields, [
        "PNP Device ID",
        "PNP_Device_ID",
        "ID PNP-устройства",
        "ИД PNP-устройства",
        "PNP デバイス ID",
        "PNPデバイス ID",
        "Plug and Play デバイス ID",
      ]);
      const vals = Object.values(s.fields).join(" ");
      if (/VEN_10DE|VEN_8086|VEN_1002|NVIDIA|GeForce|RTX|Quadro|Tesla|Radeon|Intel\s*\(R\)|UHD\s*Graphics|Iris|Arc/i.test(vals))
        return true;
      return name.length > 0 || pnp.length > 0 || Object.keys(s.fields).length >= 4;
    });
  }

  /**
   * @param {{ path: string, fields: Record<string, string> }[]} rows
   * @returns {{ path: string, fields: Record<string, string> }[]}
   */
  function segmentMsInfoDisplayRows(rows) {
    /** @type {{ path: string, fields: Record<string, string> }[]} */
    const out = [];
    for (const r of rows) {
      if (!isMsInfoDisplayRelatedPath(r.path)) continue;
      const f = r.fields;
      const name = String(displayAdapterDisplayName(f) || f.Device || "").trim();
      if (!name) continue;
      out.push({ path: r.path, fields: { ...f } });
    }
    return out;
  }

  /**
   * @param {{ path: string, fields: Record<string, string> }[]} segments
   */
  function dedupeDisplayAdapterSegments(segments) {
    /** @type {{ path: string, fields: Record<string, string> }[]} */
    const out = [];
    const seen = new Set();
    for (const s of segments) {
      const pnp = displayFieldByLabels(s.fields, [
        "PNP Device ID",
        "PNP_Device_ID",
        "ID PNP-устройства",
        "ИД PNP-устройства",
        "PNP デバイス ID",
        "PNPデバイス ID",
        "Plug and Play デバイス ID",
      ])
        .replace(/\s+/g, "")
        .toUpperCase();
      const name = displayAdapterDisplayName(s.fields).toLowerCase();
      const key = pnp || `name:${name}|path:${s.path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(s);
    }
    return out;
  }

  /** @param {Record<string, string>} fields */
  function gpuVendorLabelFromAdapterFields(fields) {
    const name = `${displayAdapterDisplayName(fields)}`;
    const pnp = `${fields["PNP Device ID"] || fields.PNP_Device_ID || fields["ID PNP-устройства"] || fields["ИД PNP-устройства"] || fields["PNP デバイス ID"] || fields["PNPデバイス ID"] || fields["Plug and Play デバイス ID"] || ""}`.toUpperCase();
    const n = name.toLowerCase();
    if (/nvidia|geforce|rtx|quadro|tesla/.test(n) || /VEN_10DE/.test(pnp)) return "NVIDIA";
    if (/intel|\buhd\b|iris|arc/.test(n) || /VEN_8086/.test(pnp)) return "INTEL";
    if (/amd|radeon/.test(n) || /VEN_1002/.test(pnp)) return "AMD";
    return gpuVendorLabelFromName(name);
  }

  /**
   * One display adapter from a field map (already scoped to that adapter).
   * @param {Record<string, string>} fields
   * @param {{ path: string, item: string, value: string }[]} kvs
   * @param {{ path: string, fields: Record<string, string> }[]} rows
   */
  function displayAdapterBlockFromFields(fields, kvs, rows) {
    const vendorLabel = gpuVendorLabelFromAdapterFields(fields);
    let name = displayAdapterDisplayName(fields);
    if (!name) {
      if (vendorLabel === "INTEL") name = "Intel graphics";
      else if (vendorLabel === "NVIDIA") name = "NVIDIA GPU";
      else name = "Display adapter";
    }

    let driverFull =
      displayFieldByLabels(fields, [
        "Driver Version",
        "Версия драйвера",
        "ドライバーのバージョン",
        "ドライバのバージョン",
        "ドライバー バージョン",
        "ドライバ バージョン",
      ]) || "";
    if (vendorLabel === "NVIDIA") {
      if (!driverFull || isIntelDriverVersionString(driverFull)) {
        const fixed = pickNvidiaDisplayDriverKvs(kvs) || pickNvidiaDriverFromRows(rows);
        if (fixed && !isIntelDriverVersionString(fixed)) driverFull = fixed;
      }
    } else if (vendorLabel === "INTEL") {
      let d = displayFieldByLabels(fields, ["Driver Version"]) || "";
      if (d && isNvidiaDriverVersionString(d) && !isIntelDriverVersionString(d)) d = "";
      driverFull = d;
    }

    let nvidiaDriverFormatted = "";
    if (vendorLabel === "NVIDIA" && driverFull && isNvidiaDriverVersionString(driverFull)) {
      nvidiaDriverFormatted = nvidiaInternalToDisplayVersion(driverFull);
    }

    const nmDriverVer = displayFieldByLabels(fields, [
      "Driver Version",
      "Версия драйвера",
      "ドライバーのバージョン",
      "ドライバのバージョン",
      "ドライバー バージョン",
      "ドライバ バージョン",
    ]);
    let driverVersionDisplay = "";
    if (vendorLabel === "NVIDIA") {
      driverVersionDisplay = nvidiaDriverFormatted || nmDriverVer || driverFull || "";
    } else {
      driverVersionDisplay = nmDriverVer || driverFull || "";
    }

    const resRaw = displayFieldByLabels(fields, [
      "Resolution",
      "Current Resolution",
      "Разрешение",
      "Текущее разрешение",
      "解像度",
      "現在の解像度",
      "画面の解像度",
    ]);
    let resolution = "";
    if (resRaw && String(resRaw).trim() && !/^not available|^n\/a$/i.test(String(resRaw).trim())) {
      resolution = String(resRaw).trim();
    }

    const nvidiaDrivesDisplay = vendorLabel === "NVIDIA" && !!resolution;
    const pnp = displayFieldByLabels(fields, [
      "PNP Device ID",
      "PNP_Device_ID",
      "ID PNP-устройства",
      "ИД PNP-устройства",
      "PNP デバイス ID",
      "PNPデバイス ID",
      "Plug and Play デバイス ID",
    ]);
    const devId = pnpToDeviceId(pnp);

    return {
      name,
      resolution,
      driverFull,
      driverFormatted: nvidiaDriverFormatted,
      drivesDisplay: vendorLabel !== "NVIDIA" || nvidiaDrivesDisplay,
      vendorLabel,
      driverVersionDisplay,
      driverDate:
        displayFieldByLabels(fields, [
          "Driver Date",
          "Дата драйвера",
          "ドライバーの日付",
          "ドライバの日付",
          "ドライバー 日付",
          "バージョンの日付",
          "ドライバー バージョンの日付",
          "ドライバのバージョンの日付",
        ]) || "",
      deviceId: devId,
      pciLookupUrl: pciLookupUrlFromDeviceId(devId),
      adapterType:
        displayFieldByLabels(fields, [
          "Adapter Type",
          "Тип адаптера",
          "Описание адаптера",
          "アダプターの種類",
          "アダプター種類",
          "アダプタの種類",
          "アダプター タイプ",
          "製品の種類",
          "チップの種類",
          "チップ タイプ",
        ]) || "",
      adapterRam:
        displayFieldByLabels(fields, [
          "Adapter RAM",
          "ОЗУ адаптера",
          "Память адаптера",
          "アダプター RAM",
          "アダプタ RAM",
          "アダプターの RAM",
        ]) || "",
    };
  }

  /** @param {Record<string, unknown> | null | undefined} g */
  function hasGpuCardContent(g) {
    return !!(g && (g.name || g.driverFull || g.driverVersionDisplay || g.adapterType || g.deviceId));
  }

  /** @param {string} name */
  function gpuVendorLabelFromName(name) {
    const n = String(name || "").toLowerCase();
    if (/nvidia|geforce|rtx|quadro|tesla/.test(n)) return "NVIDIA";
    if (/intel|\buhd\b|iris|arc/.test(n)) return "INTEL";
    if (/amd|radeon/.test(n)) return "AMD";
    return "GPU";
  }

  /**
   * Map display-related paths → fields; split Intel vs NVIDIA resolution and drivers.
   * @param {{ path: string, item: string, value: string }[]} kvs
   * @param {{ path: string, fields: Record<string, string> }[]} rows
   */
  function extractDisplayGpuSummary(kvs, rows = []) {
    const segmented = dedupeDisplayAdapterSegments([
      ...segmentMsInfoDisplayKvs(kvs),
      ...segmentMsInfoDisplayRows(rows),
    ]);
    /** @type {Record<string, unknown>[]} */
    const adaptersFromSegments = [];
    for (const seg of segmented) {
      const block = displayAdapterBlockFromFields(seg.fields, kvs, rows);
      if (hasGpuCardContent(block)) adaptersFromSegments.push(block);
    }

    if (adaptersFromSegments.length > 0) {
      const intel = adaptersFromSegments.find((a) => a.vendorLabel === "INTEL") || null;
      const nvidia = adaptersFromSegments.find((a) => a.vendorLabel === "NVIDIA") || null;
      return { adapters: adaptersFromSegments, intel, nvidia };
    }

    /** @type {Map<string, Record<string, string>>} */
    const byPath = new Map();
    for (const k of kvs) {
      if (!isMsInfoDisplayRelatedPath(k.path)) continue;
      if (!byPath.has(k.path)) byPath.set(k.path, {});
      byPath.get(k.path)[k.item] = k.value;
    }

    let nvidiaPath = "";
    let intelPath = "";
    for (const [path, o] of byPath) {
      const dn = displayAdapterDisplayName(o);
      const vals = Object.values(o).join(" ");
      const name = `${dn} ${path} ${vals}`.toLowerCase();
      if (/nvidia|geforce|rtx|quadro|tesla|ven_10de/.test(name)) {
        const prevDn = nvidiaPath ? displayAdapterDisplayName(byPath.get(nvidiaPath) || {}) : "";
        if (!nvidiaPath || (dn && dn.length > prevDn.length)) {
          nvidiaPath = path;
        }
      }
      if (
        /intel|インテル/i.test(name) &&
        /uhd|iris|arc|graphics|630|640|770|xe|igpu|integrated|ven_8086/.test(name) &&
        !/nvidia|geforce|rtx|quadro|tesla|ven_10de/.test(name)
      ) {
        if (!intelPath || (dn && /UHD|Iris|Arc/i.test(dn))) intelPath = path;
      }
    }

    if (!intelPath) {
      for (const [path] of byPath) {
        const pl = path.toLowerCase();
        if ((/intel\(r\)|\buhd\b|iris|intel arc/.test(pl)) && !/nvidia/.test(pl)) {
          intelPath = path;
          break;
        }
      }
    }

    const driverOnPath = (p) => {
      if (!p) return "";
      const k = kvs.find((x) => x.path === p && isDriverVersionItem(x.item));
      return k?.value?.trim() || "";
    };

    let nvidiaRes = "";
    let intelRes = "";
    for (const k of kvs) {
      if (!isResolutionItemLabel(k.item)) continue;
      if (!isMsInfoDisplayRelatedPath(k.path)) continue;
      const pl = k.path.toLowerCase();
      if (isNvidiaGraphicsPath(k.path) || /nvidia|geforce|rtx|quadro/.test(pl)) {
        nvidiaRes = nvidiaRes || k.value.trim();
      } else if (isIntelGraphicsPath(k.path) || (/intel|uhd|iris|arc/.test(pl) && !/nvidia/.test(pl))) {
        intelRes = intelRes || k.value.trim();
      }
    }
    for (const k of kvs) {
      if (!isResolutionItemLabel(k.item)) continue;
      if (k.path === nvidiaPath && !nvidiaRes) nvidiaRes = k.value.trim();
      if (k.path === intelPath && !intelRes) intelRes = k.value.trim();
    }

    if (!intelRes && !nvidiaRes) {
      const rlist = kvs.filter(
        (k) => isResolutionItemLabel(k.item) && isMsInfoDisplayRelatedPath(k.path)
      );
      if (rlist.length === 1) {
        const r = rlist[0].value.trim();
        if (intelPath && nvidiaPath) intelRes = r;
        else if (intelPath) intelRes = r;
        else if (nvidiaPath) nvidiaRes = r;
      }
    }

    if (!intelRes) intelRes = resolutionFromDisplayRows(rows, "intel");
    if (!nvidiaRes) nvidiaRes = resolutionFromDisplayRows(rows, "nvidia");

    const nvidiaNameFromKv = kvs.find(
      (k) =>
        isDisplayNameItem(k.item) &&
        (/NVIDIA|GeForce|RTX|Quadro|Tesla/i.test(k.value) || /\bVEN_10DE\b/i.test(k.value))
    );
    const nvidiaName =
      (nvidiaPath ? displayAdapterDisplayName(byPath.get(nvidiaPath) || {}) : "") ||
      nvidiaNameFromKv?.value?.trim() ||
      "";
    const intelName = intelPath ? displayAdapterDisplayName(byPath.get(intelPath) || {}) : "";

    let nvidiaDriverFull = pickNvidiaDisplayDriverKvs(kvs) || pickNvidiaDriverFromRows(rows);
    if (!nvidiaDriverFull && nvidiaPath) {
      const d = driverOnPath(nvidiaPath);
      if (d && !isIntelDriverVersionString(d)) nvidiaDriverFull = d;
    }

    let intelDriverFull = "";
    if (intelPath) {
      const onIntel = kvs.filter((k) => k.path === intelPath && isDriverVersionItem(k.item));
      const intelRow = onIntel.find((k) => isIntelDriverVersionString(k.value.trim()));
      if (intelRow) {
        intelDriverFull = intelRow.value.trim();
      } else {
        const raw = driverOnPath(intelPath);
        if (raw && !/\b3[12]\.0\.15\.\d+/.test(raw)) intelDriverFull = raw;
        else if (onIntel[0]) intelDriverFull = onIntel[0].value.trim();
      }
    }

    if (!nvidiaDriverFull || isIntelDriverVersionString(nvidiaDriverFull)) {
      const fixed = pickNvidiaDisplayDriverKvs(kvs) || pickNvidiaDriverFromRows(rows);
      if (fixed) nvidiaDriverFull = fixed;
    }

    const nvidiaDriverFormatted =
      nvidiaDriverFull && isNvidiaDriverVersionString(nvidiaDriverFull)
        ? nvidiaInternalToDisplayVersion(nvidiaDriverFull)
        : "";

    const nvidiaDrivesDisplay = !!nvidiaRes;

    const intelFields = mergePathFields(intelPath, byPath, rows);
    const nvidiaFields = mergePathFields(nvidiaPath, byPath, rows);

    /** @type {{ name: string, resolution: string, driverFull: string } | null} */
    let intelBlock = null;
    if (intelPath && (intelName || intelRes || intelDriverFull)) {
      const im = {
        driverVersion: displayFieldByLabels(intelFields, [
          "Driver Version",
          "Версия драйвера",
          "ドライバーのバージョン",
          "ドライバのバージョン",
          "ドライバー バージョン",
          "ドライバ バージョン",
        ]),
        driverDate: displayFieldByLabels(intelFields, [
          "Driver Date",
          "Дата драйвера",
          "ドライバーの日付",
          "ドライバの日付",
          "ドライバー 日付",
          "バージョンの日付",
          "ドライバー バージョンの日付",
          "ドライバのバージョンの日付",
        ]),
        pnp: displayFieldByLabels(intelFields, [
          "PNP Device ID",
          "PNP_Device_ID",
          "ID PNP-устройства",
          "ИД PNP-устройства",
          "PNP デバイス ID",
          "PNPデバイス ID",
          "Plug and Play デバイス ID",
        ]),
        adapterType: displayFieldByLabels(intelFields, [
          "Adapter Type",
          "Тип адаптера",
          "Описание адаптера",
          "アダプターの種類",
          "アダプター種類",
          "アダプタの種類",
          "アダプター タイプ",
          "製品の種類",
          "チップの種類",
          "チップ タイプ",
        ]),
        adapterRam: displayFieldByLabels(intelFields, [
          "Adapter RAM",
          "ОЗУ адаптера",
          "Память адаптера",
          "アダプター RAM",
          "アダプタ RAM",
          "アダプターの RAM",
        ]),
      };
      const devId = pnpToDeviceId(im.pnp);
      intelBlock = {
        name: intelName || "Intel graphics",
        resolution: intelRes,
        driverFull: intelDriverFull,
        vendorLabel: "INTEL",
        driverVersionDisplay: im.driverVersion || intelDriverFull || "",
        driverDate: im.driverDate || "",
        deviceId: devId,
        pciLookupUrl: pciLookupUrlFromDeviceId(devId),
        adapterType: im.adapterType || "",
        adapterRam: im.adapterRam || "",
      };
    }

    /** @type {{ name: string, resolution: string, driverFull: string, driverFormatted: string, drivesDisplay: boolean } | null} */
    let nvidiaBlock = null;
    if (nvidiaName || nvidiaDriverFull || nvidiaPath) {
      const nm = {
        driverVersion: displayFieldByLabels(nvidiaFields, [
          "Driver Version",
          "Версия драйвера",
          "ドライバーのバージョン",
          "ドライバのバージョン",
          "ドライバー バージョン",
          "ドライバ バージョン",
        ]),
        driverDate: displayFieldByLabels(nvidiaFields, [
          "Driver Date",
          "Дата драйвера",
          "ドライバーの日付",
          "ドライバの日付",
          "ドライバー 日付",
          "バージョンの日付",
          "ドライバー バージョンの日付",
          "ドライバのバージョンの日付",
        ]),
        pnp: displayFieldByLabels(nvidiaFields, [
          "PNP Device ID",
          "PNP_Device_ID",
          "ID PNP-устройства",
          "ИД PNP-устройства",
          "PNP デバイス ID",
          "PNPデバイス ID",
          "Plug and Play デバイス ID",
        ]),
        adapterType: displayFieldByLabels(nvidiaFields, [
          "Adapter Type",
          "Тип адаптера",
          "Описание адаптера",
          "アダプターの種類",
          "アダプター種類",
          "アダプタの種類",
          "アダプター タイプ",
          "製品の種類",
          "チップの種類",
          "チップ タイプ",
        ]),
        adapterRam: displayFieldByLabels(nvidiaFields, [
          "Adapter RAM",
          "ОЗУ адаптера",
          "Память адаптера",
          "アダプター RAM",
          "アダプタ RAM",
          "アダプターの RAM",
        ]),
      };
      const devIdN = pnpToDeviceId(nm.pnp);
      const verDisp =
        nvidiaDriverFormatted || nm.driverVersion || nvidiaDriverFull || "";
      nvidiaBlock = {
        name: nvidiaName || "NVIDIA GPU",
        resolution: nvidiaDrivesDisplay ? nvidiaRes : "",
        driverFull: nvidiaDriverFull,
        driverFormatted: nvidiaDriverFormatted,
        drivesDisplay: nvidiaDrivesDisplay,
        vendorLabel: "NVIDIA",
        driverVersionDisplay: verDisp,
        driverDate: nm.driverDate || "",
        deviceId: devIdN,
        pciLookupUrl: pciLookupUrlFromDeviceId(devIdN),
        adapterType: nm.adapterType || "",
        adapterRam: nm.adapterRam || "",
      };
    }

    /** @type {Record<string, unknown>[]} */
    const adaptersFallback = [];
    if (intelBlock && hasGpuCardContent(intelBlock)) adaptersFallback.push(intelBlock);
    if (nvidiaBlock && hasGpuCardContent(nvidiaBlock)) adaptersFallback.push(nvidiaBlock);

    return {
      adapters: adaptersFallback,
      intel: intelBlock,
      nvidia: nvidiaBlock,
    };
  }

  /** @param {Record<string, string>} fields @param {string} path */
  function classifyNetworkMedium(fields, path) {
    const name =
      fields.Name ||
      fields.Имя ||
      fields["名前"] ||
      fields["デバイス名"] ||
      fields.Device ||
      fields.Item ||
      fields.Description ||
      "";
    const desc = fields.Description || fields["Product Name"] || fields["Тип продукта"] || fields["製品名"] || "";
    const aType =
      fields["Adapter Type"] ||
      fields["Тип адаптера"] ||
      fields["アダプターの種類"] ||
      fields["アダプタの種類"] ||
      fields["Connection Type"] ||
      fields.Type ||
      fields["Interface type"] ||
      "";
    const hayName = `${name} ${path}`.toLowerCase();
    const hayAll = `${name} ${desc} ${aType} ${path}`.toLowerCase();

    if (
      /wi-?fi|wlan|802\.11|wireless|ax210|ax211|ax201|ax200|ac\s*9560|ac\s*9260|8822ce|8852ae|be200|be201|rz616|mt7921|mt7922|mediatek|killer\s*wi|killer\s*1650|killer\s*1675|broadcom.*802\.11|realtek.*rtl88|realtek.*rtl89|qualcomm.*fastconnect/i.test(
        hayName
      )
    ) {
      return "Wi-Fi";
    }
    if (/wi-?fi|wlan|802\.11|wireless(?!.*display)|無線lan|ワイヤレスlan|無線\s*lan/i.test(hayAll)) {
      return "Wi-Fi";
    }
    if (/bluetooth|hyper-?v virtual|vmware|virtualbox|loopback|teredo|isatap|6to4|pseudo|miniport|wan miniport/i.test(hayAll)) {
      return "Other (virtual / tunnel)";
    }
    if (/(gigabit|10g|2\.5g|5g|1000|100)\s*(base|ethernet|mbps)|\brj-?45|usb.*gbe|thunderbolt.*lan|powerline|intel\(r\)\s*i219|i225-v|ethernet controller/i.test(hayAll)) {
      return "Ethernet (wired)";
    }
    if (/\bethernet\b/i.test(hayAll) && !/wi-?fi|802\.11|wlan|wireless/i.test(hayName)) {
      return "Ethernet (wired)";
    }
    if (/802\.3|ieee\s*802\.3/i.test(aType.toLowerCase()) && !/wi-?fi|802\.11|wlan|wireless/i.test(hayName)) {
      return "Ethernet (reported as 802.3)";
    }
    if (/802\.3|ieee\s*802\.3/i.test(hayAll)) {
      return "Unknown (802.3 in export — if you use Wi‑Fi, trust the adapter name)";
    }
    return "Other / unknown";
  }

  /** @param {Record<string, string>} fields */
  function networkAdapterIdentityKey(fields) {
    const raw =
      fields.Name ||
      fields.Имя ||
      fields["名前"] ||
      fields["デバイス名"] ||
      fields.Device ||
      fields.Description ||
      fields["Connection Name"] ||
      fields.NetConnectionID ||
      fields["Adapter Name"] ||
      "";
    return String(raw).trim().toLowerCase();
  }

  /**
   * MSInfo uses mixed labels; merge case-insensitive and fuzzy key match.
   * @param {Record<string, string>} fields
   * @param {string[]} exactNames
   */
  function getNetworkField(fields, ...exactNames) {
    for (const n of exactNames) {
      const v = fields[n];
      if (v != null && String(v).trim()) return String(v);
    }
    const lowerMap = new Map();
    for (const [k, v] of Object.entries(fields)) {
      if (v == null || !String(v).trim()) continue;
      lowerMap.set(k.trim().toLowerCase().replace(/\s+/g, " "), v);
    }
    for (const n of exactNames) {
      const hit = lowerMap.get(n.trim().toLowerCase().replace(/\s+/g, " "));
      if (hit) return String(hit);
    }
    return "";
  }

  /** @param {Record<string, string>} fields */
  function pickIpv4FromFields(fields) {
    const tryVal = (v) => {
      const t = String(v || "").trim();
      if (
        !t ||
        /^(?:not available|n\/a|недоступно|nicht verfügbar|niet beschikbaar|indisponível|indisponible|non disponibile|ikke tilgængelig|ej tillgänglig|ikke tilgjengelig|ei käytettävissä|ei saatavilla|yok|غير متوفر|無法使用|不可用|사용할 수 없음|利用できません)$/i.test(
          t
        )
      )
        return "";
      const all = t.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g) || [];
      for (const ip of all) {
        if (isUsableInternetIpv4(ip)) return ip;
      }
      return "";
    };
    const direct = getNetworkField(
      fields,
      "IP Address",
      "IP address",
      "IP-адрес",
      "IPv4 Address",
      "IPv4 address",
      "IPv4-адрес",
      "Address",
      "Adresse IP",
      "Adresse IPv4",
      "IPv4-Adresse",
      "IP-Adresse",
      "IP-adresse",
      "IP-adress",
      "IPv4-adress",
      "IP-osoite",
      "IPv4-osoite",
      "IP-adres",
      "IPv4-adres",
      "Indirizzo IP",
      "Indirizzo IPv4",
      "Dirección IP",
      "Dirección IPv4",
      "Endereço IP",
      "Endereço IPv4",
      "Adres IP",
      "Adres IPv4",
      "Adresa IP",
      "Adresa IPv4",
      "IP-adresa",
      "IPv4 adresa",
      "IP-cím",
      "IPv4-cím",
      "IP adresi",
      "IPv4 adresi",
      "Adresă IP",
      "Adresă IPv4",
      "IP-aadress",
      "IPv4-aadress",
      "IP-adress (IPv4)",
      "Διεύθυνση IP",
      "Διεύθυνση IPv4",
      "IP アドレス",
      "IPv4 アドレス",
      "IP 주소",
      "IPv4 주소",
      "IP 地址",
      "IPv4 地址",
      "عنوان IP",
      "عنوان IPv4"
    );
    let hit = tryVal(direct);
    if (hit) return hit;
    for (const [k, v] of Object.entries(fields)) {
      if (!v || !String(v).trim()) continue;
      const kl = k.toLowerCase();
      const addrHint =
        /address|адрес|adres|addr|osoite|direcci|indirizzo|endereço|διεύθυνση|주소|地址|aadress|adresă|adresse|c[iíì]m|عنوان/i.test(
          kl
        );
      if (
        (kl.includes("ipv4") && addrHint) ||
        (kl.includes("ip") && addrHint && !kl.includes("ipv6")) ||
        (/ipv4/i.test(kl) && addrHint && !kl.includes("ipv6"))
      ) {
        hit = tryVal(v);
        if (hit) return hit;
      }
    }
    return "";
  }

  /** Any plausible IPv6 literal for display (includes link-local; excludes loopback and multicast). */
  function isIpv6LiteralForDisplay(s) {
    const t = String(s || "")
      .trim()
      .replace(/%\d+$/, "")
      .replace(/^\[|\]$/g, "")
      .toLowerCase();
    if (!t || t === "::" || t === "::1") return false;
    if (!/:/.test(t)) return false;
    if (!/^[0-9a-f:.]+$/i.test(t)) return false;
    if (/^ff[0-9a-f]{0,2}:/i.test(t)) return false;
    return true;
  }

  /** Comma-separated unique IPv6s from IP Address combo field and IPv6-specific columns. */
  function collectAllIpv6ForDisplay(fields) {
    /** @type {string[]} */
    const parts = [];
    const seen = new Set();
    const pushTok = (raw) => {
      const u = String(raw || "")
        .replace(/^\[|\]$/g, "")
        .replace(/%\d+$/, "")
        .trim();
      if (
        !u ||
        /^(?:not available|n\/a|недоступно|nicht verfügbar|niet beschikbaar|indisponível|indisponible|non disponibile|ikke tilgængelig|ej tillgänglig|ikke tilgjengelig|ei käytettävissä|ei saatavilla|yok|غير متوفر|無法使用|不可用|사용할 수 없음|利用できません)$/i.test(
          u
        )
      )
        return;
      if (!isIpv6LiteralForDisplay(u)) return;
      const low = u.toLowerCase();
      if (seen.has(low)) return;
      seen.add(low);
      parts.push(u);
    };
    const scan = (raw) => {
      if (!raw) return;
      const s = stripMsInfoNoise(raw);
      for (const token of s.split(/[,\n;]+/)) pushTok(token.trim());
    };
    scan(
      getNetworkField(
        fields,
        "IP Address",
        "IP address",
        "IP-адрес",
        "IPv4-адрес",
        "IPv4 Address",
        "IPv4 address",
        "Adresse IP",
        "Adresse IPv4",
        "IPv4-Adresse",
        "IP-Adresse",
        "IP-adresse",
        "IP-adress",
        "IPv4-adress",
        "IP-osoite",
        "IPv4-osoite",
        "IP-adres",
        "IPv4-adres",
        "Indirizzo IP",
        "Indirizzo IPv4",
        "Dirección IP",
        "Dirección IPv4",
        "Endereço IP",
        "Endereço IPv4",
        "Adres IP",
        "Adres IPv4",
        "IP 주소",
        "IPv4 주소",
        "IP 地址",
        "IPv4 地址"
      )
    );
    for (const name of [
      "IPv6 Address",
      "IPv6 address",
      "IPv6-адрес",
      "Global IPv6 Address",
      "Temporary IPv6 Address",
      "Link-local IPv6 Address",
      "Link-Local IPv6 Address",
    ]) {
      scan(getNetworkField(fields, name));
    }
    for (const [k, v] of Object.entries(fields)) {
      if (!v || !String(v).trim()) continue;
      const kl = k.toLowerCase();
      if (/dns|multicast|gateway/i.test(kl)) continue;
      if (
        /^ip\s*address$/i.test(kl) ||
        (/ipv6/i.test(kl) && /address|addr|адрес|adres|osoite|direcci|indirizzo|endereço|διεύθυνση|주소|地址|aadress|adresă|adresse|c[iíì]m|عنوان/i.test(kl))
      )
        scan(v);
      if (
        /ip/i.test(kl) &&
        /адрес|adres|osoite|direcci|indirizzo|endereço|διεύθυνση|주소|地址|aadress|adresă|adresse|c[iíì]m|عنوان/i.test(kl) &&
        !/ipv6|dns|шлюз|gateway/i.test(kl)
      )
        scan(v);
    }
    return parts.join(", ");
  }

  /** @param {string} s */
  function stripMsInfoNoise(s) {
    return String(s || "")
      .replace(/\([^)]*\)/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Non–link-local, non-multicast IPv6 suitable as a host or DNS literal in the export.
   * @param {string} s
   */
  function isUsableInternetIpv6Literal(s) {
    let t = String(s || "")
      .trim()
      .replace(/%\d+$/, "")
      .replace(/^\[|\]$/g, "")
      .toLowerCase();
    if (!t || t === "::") return false;
    if (t === "::1") return false;
    if (/^fe[89ab][0-9a-f]{0,3}:/i.test(t)) return false;
    if (/^ff[0-9a-f]{0,2}:/i.test(t)) return false;
    if (!/:/.test(t)) return false;
    if (!/^[0-9a-f:.]+$/i.test(t)) return false;
    return true;
  }

  /** @param {Record<string, string>} fields */
  function pickUsableIpv6FromFields(fields) {
    const tryValue = (raw) => {
      const s = stripMsInfoNoise(raw);
      for (const token of s.split(/[,\n;]+/)) {
        const u = token.replace(/%\d+$/, "").trim();
        if (isUsableInternetIpv6Literal(u)) return u;
      }
      return "";
    };
    const keyHints = [
      "IPv6 Address",
      "IPv6 address",
      "IPv6-адрес",
      "Global IPv6 Address",
      "Temporary IPv6 Address",
    ];
    for (const n of keyHints) {
      const v = getNetworkField(fields, n) || fields[n];
      if (v) {
        const hit = tryValue(v);
        if (hit) return hit;
      }
    }
    for (const n of ["IP Address", "IP address", "IP-адрес", "Addresses"]) {
      const v = getNetworkField(fields, n) || fields[n];
      if (v) {
        const hit = tryValue(v);
        if (hit) return hit;
      }
    }
    for (const [k, v] of Object.entries(fields)) {
      if (!v || !String(v).trim()) continue;
      const kl = k.toLowerCase();
      if (/ip/i.test(kl) && /адрес/i.test(kl) && !/ipv6|dns|шлюз|gateway/i.test(kl)) {
        const hit = tryValue(v);
        if (hit) return hit;
      }
      if (!kl.includes("ipv6")) continue;
      if (/(dns|gateway|multicast)/i.test(kl)) continue;
      if (!/(address|addr\.?|адрес)/i.test(kl) && !/^ipv6 address$/i.test(k)) continue;
      const hit = tryValue(v);
      if (hit) return hit;
    }
    return "";
  }

  /**
   * DNS / resolver field value lists at least one plausible resolver (IPv4 or IPv6).
   * @param {string} value
   */
  function dnsValueListsResolver(value) {
    const s = stripMsInfoNoise(value);
    if (!s || /^not available|^n\/a|^недоступно$/i.test(s)) return false;
    const v4s = s.match(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g) || [];
    for (const ip of v4s) {
      if (isUsableInternetIpv4(ip)) return true;
    }
    for (const token of s.split(/[,\s;]+/)) {
      const u = token.replace(/^\[|\]$/g, "").replace(/%\d+$/, "").trim();
      if (isUsableInternetIpv6Literal(u)) return true;
    }
    return false;
  }

  /**
   * @param {Record<string, string>} fields
   * @returns { { k: string, v: string }[] }
   */
  function pickDnsDetailEntries(fields) {
    /** @type { { k: string, v: string }[] } */
    const out = [];
    const seen = new Set();
    const push = (k, v) => {
      const t = String(v || "").trim();
      if (!t || /^not available|^n\/a|^недоступно$/i.test(t)) return;
      const key = `${k}\0${t}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ k, v: t });
    };
    const named = [
      "DNS Server",
      "DNS Servers",
      "DNS servers",
      "DNS-сервер",
      "DNS сервер",
      "DNS サーバー",
      "DNSサーバー",
      "優先 DNS サーバー",
      "代替 DNS サーバー",
      "プライマリ DNS サーバー",
      "セカンダリ DNS サーバー",
      "Preferred DNS",
      "Alternate DNS",
      "Primary DNS",
      "Secondary DNS",
      "Preferred DNS server",
      "Alternate DNS server",
      "Предпочитаемый DNS-сервер",
      "Альтернативный DNS-сервер",
      "Connection-specific DNS Suffix",
      "DNS Suffix",
      "DNS サフィックス",
      "接続固有の DNS サフィックス",
    ];
    for (const n of named) {
      const v = getNetworkField(fields, n);
      if (v) push(n, v);
    }
    for (const [k, v] of Object.entries(fields)) {
      if (!v || !String(v).trim()) continue;
      const kl = k.toLowerCase();
      if (!/dns|suffix/.test(kl)) continue;
      if (/hostname|wins|netbios|vendor/i.test(kl)) continue;
      push(k, v);
    }
    return out;
  }

  /** @param {string} path */
  function pathLooksLikeNetworkSection(path) {
    const p = path || "";
    if (!p.trim()) return false;
    if (/display|graphics|video|printer|audio|bluetooth|personal area network|usb.*audio/i.test(p)) return false;
    /** CJK path segments: do not rely on \\b (ASCII word chars only in default JS). */
    if (
      /ネットワーク|アダプター|アダプタ|tcp\s*\/\s*ip|ワイヤレス|無線lan|有線lan|イーサネット|lan\s*接続|通信|nic|ipconfig/i.test(
        p
      )
    )
      return true;
    return (
      /\bnetwork|\bnetzwerk|\bréseau|\bnetworking\b|tcp\/ip|ipconfig|wlan|wi-?fi|wifi\b|802\.11|wireless lan|ethernet connection|nic\b|network adapter|win32.*network|remote access|vpn|hyper-?v.*switch/i.test(
        p
      ) ||
      /\bсеть\b|сетев|адаптер|tcp\s*\/\s*ip|беспровод|подключен|удаленн|компоненты.*сеть|сеть.*адапт/i.test(p) ||
      /\b(red|netwerk|netværk|nettverk|verkko|sieć|síť|rețea|ağ|δίκτυο|võrk|网络|網路|ネットワーク|네트워크|شبكة)\b/i.test(
        p
      ) ||
      /网络|網路|ネットワーク|네트워크|شبكة/.test(p)
    );
  }

  /**
   * MSInfo often emits many Data rows with the same category path (e.g. "Components / Network").
   * Each adapter restarts with Item "Name". Without splitting, keys overwrite and IP/gateway are lost.
   * @param {{ path: string, item: string, value: string }[]} pathKvs in document order
   */
  function splitNetworkKvsIntoAdapterRecords(pathKvs) {
    /** @type {Record<string, string>[]} */
    const out = [];
    /** @type {Record<string, string>} */
    let cur = {};
    const isAdapterNameItem = (/** @type {string} */ item) => {
      const it = String(item || "").trim();
      return (
        /^name$/i.test(it) ||
        /^namn$/i.test(it) ||
        /^nimi$/i.test(it) ||
        /^nome$/i.test(it) ||
        /^naam$/i.test(it) ||
        /^navn$/i.test(it) ||
        /^název$/i.test(it) ||
        /^nazwa$/i.test(it) ||
        /^nombre$/i.test(it) ||
        /^имя$/i.test(it) ||
        /^наименование$/i.test(it) ||
        /^名称$/i.test(it) ||
        /^名稱$/i.test(it) ||
        /^名前$/i.test(it) ||
        /^이름$/i.test(it) ||
        /^الاسم$/i.test(it) ||
        /^όνομα$/iu.test(it)
      );
    };
    const recordHasAdapterNameKey = (/** @type {Record<string, string>} */ rec) => {
      for (const k of Object.keys(rec)) {
        if (!rec[k]) continue;
        if (isAdapterNameItem(k)) return true;
      }
      return Object.prototype.hasOwnProperty.call(rec, "Name") || Object.prototype.hasOwnProperty.call(rec, "Имя");
    };
    for (const k of pathKvs) {
      const item = (k.item || "").trim();
      if (!item) continue;
      const nameKeyPresent = recordHasAdapterNameKey(cur);
      if (isAdapterNameItem(item) && nameKeyPresent) {
        out.push(cur);
        cur = {};
      }
      cur[item] = k.value;
    }
    if (Object.keys(cur).length) out.push(cur);
    return out;
  }

  /** Bluetooth / PAN “network” entries are not internet paths; exclude by name/path too. */
  function isBluetoothOrPanAdapter(fields, path) {
    const blob = `${path} ${fields.Name || ""} ${fields.Имя || ""} ${fields["名前"] || ""} ${fields["デバイス名"] || ""} ${fields.Nimi || ""} ${fields.Naam || ""} ${fields.Nazwa || ""} ${fields.Nome || ""} ${fields.Device || ""} ${fields.Description || ""} ${fields["Adapter Type"] || ""} ${fields["Тип адаптера"] || ""} ${fields["Connection Name"] || ""}`.toLowerCase();
    return /\bbluetooth\b|personal area network|bt\s*pan|usb bluetooth network/i.test(blob);
  }

  /** @param {string} ip */
  function isUsableInternetIpv4(ip) {
    const t = String(ip || "").trim();
    if (!t || !/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(t)) return false;
    if (/^169\.254\./.test(t) || /^0\.0\.0\.0$/i.test(t)) return false;
    if (
      /not available|n\/a|недоступно|nicht verfügbar|nicht zutreffend|niet beschikbaar|indisponível|indisponible|non disponibile|ikke tilgængelig|ej tillgänglig|ikke tilgjengelig|ei käytettävissä|ei saatavilla|nav pieejams|pole saadaval|nincs megadva|brak|n\/d|n\.d\.|n\/v|n\/k|yok|غير متوفر|無法使用|不可用|사용할 수 없음|利用できません/i.test(
        t
      )
    )
      return false;
    return true;
  }

  /**
   * True when the export lists DNS resolvers (IPv4 and/or IPv6), not merely a connection suffix.
   * @param {Record<string, string>} fields
   */
  function hasDnsServersInExport(fields) {
    for (const [k, v] of Object.entries(fields)) {
      if (!v || !String(v).trim()) continue;
      const kl = k.toLowerCase();
      if (!/dns|nameserver|name server|resolver/i.test(kl)) continue;
      if (/suffix|search list|hostname|wins|netbios|node type|vendor/i.test(kl)) continue;
      if (dnsValueListsResolver(v)) return true;
    }
    for (const { k, v } of pickDnsDetailEntries(fields)) {
      const kl = k.toLowerCase();
      if (/suffix|search list/i.test(kl)) continue;
      if (dnsValueListsResolver(v)) return true;
    }
    return false;
  }

  /**
   * MSInfo often omits DNS when it is supplied by DHCP; accept gateway / DHCP server as connectivity proof.
   * @param {Record<string, string>} fields
   */
  function hasDnsOrInfrastructureHint(fields) {
    if (hasDnsServersInExport(fields)) return true;
    const gw = getNetworkField(fields, ...MSINFO_IPV4_GATEWAY_LABELS) || fields["Default IP Gateway"];
    const dhcpSrv = getNetworkField(fields, ...MSINFO_DHCP_SERVER_LABELS) || fields["DHCP Server"];
    const blob = `${gw || ""} ${dhcpSrv || ""}`;
    const ips = blob.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g) || [];
    return ips.some((ip) => isUsableInternetIpv4(ip));
  }

  /**
   * Usable IPv4 and/or global IPv6, plus either explicit DNS in the export or gateway/DHCP-server IPv4 (typical DHCP).
   * @param {Record<string, string>} fields
   * @param {string} path
   */
  function isInternetConnectedAdapter(fields, path) {
    if (isBluetoothOrPanAdapter(fields, path)) return false;
    const ip4 = pickIpv4FromFields(fields);
    const ip6 = pickUsableIpv6FromFields(fields);
    const hasAddr = isUsableInternetIpv4(ip4) || !!ip6;
    if (!hasAddr) return false;
    return hasDnsOrInfrastructureHint(fields);
  }

  /** @param {Record<string, string>} fields */
  function networkAdapterActivityScore(fields) {
    let s = 0;
    const blob = JSON.stringify(fields).toLowerCase();
    const ip = pickIpv4FromFields(fields);
    if (
      ip &&
      /^\s*\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\s*$/i.test(ip.trim()) &&
      !/^169\.254\./.test(ip.trim()) &&
      !/^0\.0\.0\.0$/i.test(ip.trim()) &&
      !/not available|n\/a|недоступно|nicht verfügbar|niet beschikbaar|indisponível|indisponible|non disponibile|ikke tilgængelig|ej tillgänglig|ikke tilgjengelig|ei käytettävissä|ei saatavilla|yok|غير متوفر|無法使用|不可用|사용할 수 없음|利用できません/i.test(
        ip
      )
    ) {
      s += 14;
    }
    const gw = getNetworkField(fields, ...MSINFO_IPV4_GATEWAY_LABELS) || "";
    if (
      gw &&
      /\d+\.\d+\.\d+\.\d+/.test(gw) &&
      !/not available|n\/a|недоступно|nicht verfügbar|niet beschikbaar|indisponível|indisponible|non disponibile|ikke tilgængelig|ej tillgänglig|ikke tilgjengelig|ei käytettävissä|ei saatavilla|yok|غير متوفر|無法使用|不可用|사용할 수 없음|利用できません/i.test(
        gw
      )
    )
      s += 7;
    if (
      /media state[^\n]*connected|netconnectionstatus.*2|connection.*\bconnected\b|operational status[^\n]*up|подключен|включен|接続済み|接続されています|状態[^\n]*接続/i.test(
        blob
      )
    ) {
      s += 9;
    }
    if (
      /disconnected|disabled|media state[^\n]*disconnected|operational status[^\n]*down|not connected|отключен|остановлен|切断済み|切断されています/i.test(
        blob
      )
    ) {
      s -= 8;
    }
    if ((/dhcp enabled[^\n]*yes|dhcp.*\byes\b|dhcp.*\bда\b/i.test(blob) && s > 0)) s += 2;
    if (pickUsableIpv6FromFields(fields)) s += 12;
    return s;
  }

  /** @param {Record<string, string>} fields */
  function ipv6StatusFromFields(fields) {
    const blob = JSON.stringify(fields).toLowerCase();
    const v6Keys = [
      "IPv6 Address",
      "IPv6 address",
      "IPv6-адрес",
      "Global IPv6 Address",
      "Temporary IPv6 Address",
      "Link-local IPv6 Address",
      "Link-Local IPv6 Address",
      "IPv6 Default Gateway",
      "IPv6 DNS",
    ];
    /** @type {string[]} */
    const addrs = [];
    for (const key of v6Keys) {
      const v = getNetworkField(fields, key) || fields[key];
      if (v && !/^not available|^n\/a|^none$|^недоступно$/i.test(String(v).trim()))
        addrs.push(`${key}: ${String(v).trim()}`);
    }

    let state = "";
    if (/ipv6.*\b(enabled|yes|true)\b/i.test(blob)) state = "Enabled";
    else if (/ipv6.*\b(disabled|no|false)\b/i.test(blob)) state = "Disabled";

    // MSInfo often puts IPv6 only in the combined "IP Address" line (with IPv4) or under
    // names we already scan in collectAllIpv6ForDisplay — keep status consistent with that.
    const discoveredLiterals = collectAllIpv6ForDisplay(fields);
    /** @type {string[]} */
    let lines = addrs;
    if (!lines.length && discoveredLiterals) {
      lines = discoveredLiterals.split(", ").map((ip) => `IPv6 address: ${ip}`);
    }

    if (lines.length) {
      const use = state ? `${state} — address(es) present` : "Address(es) listed (likely in use)";
      return { summary: use, lines };
    }
    if (state) return { summary: state, lines: [] };
    return { summary: "Not listed in this export", lines: [] };
  }

  /**
   * @param {{ path: string, item: string, value: string }[]} kvs
   * @param {{ path: string, fields: Record<string, string> }[]} rows
   */
  function summarizeNetworkAdapters(kvs, rows) {
    /** @type {Map<string, Record<string, string>[]>} */
    const clustersByPath = new Map();

    /** @param {string} path @param {Record<string, string>} fields */
    function addRowCluster(path, fields) {
      if (!pathLooksLikeNetworkSection(path)) return;
      const list = clustersByPath.get(path) || [];
      const id = networkAdapterIdentityKey(fields);
      if (id) {
        const hit = list.find((o) => networkAdapterIdentityKey(o) === id);
        if (hit) {
          Object.assign(hit, fields);
          clustersByPath.set(path, list);
          return;
        }
      }
      if (!id && list.length === 1 && !networkAdapterIdentityKey(list[0])) {
        Object.assign(list[0], fields);
        clustersByPath.set(path, list);
        return;
      }
      list.push({ ...fields });
      clustersByPath.set(path, list);
    }

    for (const r of rows) {
      addRowCluster(r.path, r.fields);
    }

    /** @type {Map<string, { path: string, item: string, value: string }[]>} */
    const networkKvsByPath = new Map();
    for (const k of kvs) {
      if (!pathLooksLikeNetworkSection(k.path)) continue;
      if (!networkKvsByPath.has(k.path)) networkKvsByPath.set(k.path, []);
      networkKvsByPath.get(k.path).push(k);
    }
    for (const [path, pathKvs] of networkKvsByPath) {
      for (const fields of splitNetworkKvsIntoAdapterRecords(pathKvs)) {
        addRowCluster(path, fields);
      }
    }

    /** @type {{ path: string, fields: Record<string, string> }[]} */
    const flat = [];
    for (const [path, list] of clustersByPath) {
      for (const fields of list) flat.push({ path, fields });
    }

    const detailKeyGroups = [
      ["Connection Name", "NetConnectionID", "Имя подключения", "接続名", "ネットワーク接続名"],
      ["Name", "Имя", "名前", "デバイス名", "Adapter Name", "Adapter name", "Adapter", "アダプター名", "アダプタ名"],
      ["Product Type", "Тип продукта", "Тип продукции"],
      ["Installed", "Установлен", "Установлено", "Установлена"],
      [
        "PNP Device ID",
        "ID PNP-устройства",
        "ИД PNP-устройства",
        "Код PNP-устройства",
        "PNP-устройства",
        "PNP デバイス ID",
        "PNPデバイス ID",
      ],
      ["Last Reset", "Последний сброс"],
      ["Index", "Индекс"],
      ["Service Name", "Имя службы"],
      ["IP addresses", "IP-адрес", "IP Address"],
      [
        "DHCP Lease Expires",
        "DHCP-аренда истекает",
        "Срок аренды DHCP истекает",
        "Дата окончания аренды DHCP",
      ],
      [
        "DHCP Lease Obtained",
        "DHCP-аренда получена",
        "Срок аренды DHCP получен",
        "Дата получения аренды DHCP",
      ],
      ["Driver", "Драйвер", "ドライブ", "ドライバー", "ドライバ"],
      ["Media State", "Состояние среды передачи"],
      ["Connection Status", "Состояние подключения"],
      ["Operational Status", "Рабочее состояние"],
      ["Subnet Mask", "IP Subnet", "IP-подсеть", "IPv4 Subnet Mask", "Маска подсети"],
      [
        "Default Gateway",
        "Default IP Gateway",
        "IPv4 Default Gateway",
        "Шлюз IP по умолчанию",
        "Шлюз по умолчанию",
        "Основной шлюз",
        "デフォルト ゲートウェイ",
        "IPv4 デフォルト ゲートウェイ",
      ],
      ["DHCP Enabled", "DHCP вкл.", "DHCP включен", "DHCP 有効", "DHCP を有効にする"],
      ["DHCP Server", "DHCP-сервер", "DHCP сервер", "Сервер DHCP", "DHCP サーバー", "DHCPサーバー"],
      ["Adapter Type", "Тип адаптера", "アダプターの種類", "アダプタの種類"],
      ["MAC Address", "Physical Address", "MAC-адрес", "Физический адрес", "物理アドレス", "MAC アドレス"],
      ["Speed", "Скорость"],
    ];

    const detailKeySet = new Set();
    for (const kg of detailKeyGroups) {
      for (const x of kg) {
        detailKeySet.add(x);
        detailKeySet.add(x.trim().toLowerCase());
      }
    }

    /** @type {{ path: string, name: string, medium: string, ipv4Display: string, ipv6Display: string, ipv6: { summary: string, lines: string[] }, details: { k: string, v: string }[], score: number, primary: boolean }[]} */
    const out = [];

    for (const { path, fields } of flat) {
      if (!isInternetConnectedAdapter(fields, path)) continue;

      const name =
        fields.Name ||
        fields.Имя ||
        fields["名前"] ||
        fields["デバイス名"] ||
        fields.Device ||
        fields.Item ||
        fields.Description ||
        getNetworkField(fields, "Adapter Name", "アダプター名", "アダプタ名") ||
        path.split(" / ").pop() ||
        "";
      if (!name && Object.keys(fields).length < 2) continue;

      const medium = classifyNetworkMedium(fields, path);
      const ipv6 = ipv6StatusFromFields(fields);
      const score = networkAdapterActivityScore(fields);
      const ipv4Display = pickIpv4FromFields(fields) || "N/A";
      const ipv6Display = collectAllIpv6ForDisplay(fields) || "N/A";

      /** @type { { k: string, v: string }[] } */
      const details = [];

      for (const keyGroup of detailKeyGroups) {
        const v = getNetworkField(fields, ...keyGroup);
        const label = keyGroup[0];
        if (v && String(v).trim() && !/^not available|^n\/a$/i.test(String(v).trim())) {
          details.push({ k: label, v: String(v).trim() });
        }
      }

      for (const d of pickDnsDetailEntries(fields)) {
        if (!details.some((x) => x.k === d.k && x.v === d.v)) details.push(d);
      }

      for (const [k, v] of Object.entries(fields)) {
        if (!v || !String(v).trim()) continue;
        if (/^Item$/i.test(k) || /^Value$/i.test(k)) continue;
        const kNorm = k.trim().toLowerCase();
        if (detailKeySet.has(k) || detailKeySet.has(kNorm)) continue;
        if (/^IPv6/i.test(k)) continue;
        if (/^ip/i.test(k.toLowerCase()) && k.toLowerCase().includes("address") && !/ipv6/i.test(k)) continue;
        if (/dns|suffix/i.test(k.toLowerCase())) continue;
        if (details.some((d) => d.k === k)) continue;
        if (details.length < 32) details.push({ k, v: String(v).trim() });
      }

      out.push({
        path,
        name: name || "Network adapter",
        medium,
        ipv4Display,
        ipv6Display,
        ipv6,
        details,
        score,
        primary: false,
      });
    }

    out.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    return out;
  }

  /** @param {string} line */
  function extractWindowsBuildFromVersionLine(line) {
    const s = String(line || "");
    let m = s.match(/Build\s+(\d{4,6})\b/i);
    if (m) return m[1];
    m = s.match(/\b10\.0\.(\d{4,6})\b/);
    if (m) return m[1];
    m = s.match(/\b11\.0\.(\d{4,6})\b/);
    if (m) return m[1];
    return "";
  }

  /** @param {string} biosVersion @param {string} biosDate */
  function tryParseBiosDate(biosVersion, biosDate) {
    const blob = [biosVersion, biosDate].filter(Boolean).join(" ");
    const m = blob.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})\b/);
    if (m) {
      const a = +m[1];
      const b = +m[2];
      const y = +m[3];
      let month;
      let day;
      if (a > 12) {
        day = a;
        month = b;
      } else if (b > 12) {
        month = a;
        day = b;
      } else {
        month = a;
        day = b;
      }
      const d = new Date(y, month - 1, day);
      if (!isNaN(d.getTime())) return d;
    }
    const iso = blob.match(/\b(\d{4})[./-](\d{1,2})[./-](\d{1,2})\b/);
    if (iso) {
      const d = new Date(+iso[1], +iso[2] - 1, +iso[3]);
      if (!isNaN(d.getTime())) return d;
    }
    return null;
  }

  /** @param {string} manufacturer @param {string} product */
  function motherboardSupportLinks(manufacturer, product) {
    const man = String(manufacturer || "").toLowerCase();
    const prod = String(product || "").trim();
    const q = encodeURIComponent(`${manufacturer} ${prod} BIOS update download`.replace(/\s+/g, " ").trim());
    const googleUrl = `https://www.google.com/search?q=${q}`;
    let supportUrl = googleUrl;
    if (/^asrock\b/i.test(man)) supportUrl = "https://www.asrock.com/support/index.asp";
    else if (/\basus\b|rog\b/i.test(man)) supportUrl = "https://www.asus.com/support/download-center/";
    else if (/^msi\b/i.test(man)) supportUrl = "https://www.msi.com/support";
    else if (/gigabyte|aorus/i.test(man)) supportUrl = "https://www.gigabyte.com/Support";
    else if (/^dell\b/i.test(man)) supportUrl = "https://www.dell.com/support/home";
    else if (/hp|hewlett/i.test(man)) supportUrl = "https://support.hp.com";
    else if (/lenovo/i.test(man)) supportUrl = "https://support.lenovo.com";
    else if (/supermicro/i.test(man)) supportUrl = "https://www.supermicro.com/support/resources/";
    return { supportUrl, googleUrl };
  }

  /**
   * @param {{ path: string, item: string, value: string }[]} kvs
   * @param {{ path: string, fields: Record<string, string> }[]} rows
   * @returns {{ title: string, fileSystem: string, totalSize: string, freeSpace: string, used: string, volumeName: string, serialNumber: string, path: string }[]}
   */
  function extractStorageDrives(kvs, rows) {
    /** @type {{ title: string, fileSystem: string, totalSize: string, freeSpace: string, used: string, volumeName: string, serialNumber: string, path: string }[]} */
    const out = [];
    const seen = new Set();

    const pathIsDriveNode = (/** @type {string} */ p) => {
      const s = String(p || "");
      return (
        /\/Disks\/Drive\s+[A-Z]:/i.test(s) ||
        /\/Storage\/.*\/Drive\s+[A-Z]:/i.test(s) ||
        /Components.*Storage.*\/Drive\s+[A-Z]:/i.test(s) ||
        /\/Диски\/Диск\b/i.test(s) ||
        /\/Запоминающие устройства\/.+\/Диск/i.test(s) ||
        /Компоненты.*Запоминающие устройства.*Диски.*\/Диск/i.test(s) ||
        /Компоненты.*Накопител.*\/Диск/i.test(s) ||
        /\/Диски\/.+/i.test(s) ||
        /ドライブ\s+[A-Z]:/i.test(s) ||
        /(?:^|[\s/])ドライブ\s+[A-Z]:/i.test(s) ||
        /(?:^|[\s/])ディスク\s*\d+/i.test(s) ||
        /ストレージ.*ドライブ|ドライブ.*ストレージ/i.test(s)
      );
    };

    const fieldsFromKvs = (/** @type {string} */ path) => {
      const f = {};
      for (const k of kvs) {
        if (k.path !== path || !k.item) continue;
        f[k.item.trim()] = (k.value || "").trim();
      }
      return f;
    };

    const looksLikePhysicalDisk = (/** @type {Record<string, string>} */ f) => {
      const desc = `${f["Описание"] || ""} ${f["Description"] || ""} ${f["Model"] || ""} ${f["Модель"] || ""} ${f["モデル"] || ""} ${f["製品名"] || ""}`.toLowerCase();
      const hasModel = !!(f["Model"] || f["Модель"] || f["Model Number"] || f["Номер модели"] || f["モデル"] || f["製品名"]);
      const hasDesc = !!(f["Описание"] || f["Description"] || f["説明"]);
      const sizeBlob = `${f["Size"] || ""} ${f["Размер"] || ""} ${f["Total Size"] || ""} ${f["Ёмкость"] || ""} ${f["サイズ"] || ""} ${f["合計サイズ"] || ""}`.trim();
      const hasSized =
        sizeBlob.length > 2 &&
        /[\d,\s]+/.test(sizeBlob) &&
        /(байт|тб|гб|tb|gb|mb|bytes|go|to|バイト)/i.test(sizeBlob);
      const hasSector = !!(f["Bytes/sector"] || f["Bytes per sector"] || f["Байт/сектор"] || f["バイト/セクター"] || f["バイト／セクター"]);
      const diskish =
        /дисков|накопител|hard\s*disk|disk\s+drive|physical\s+drive|hdd|ssd|nvme|scsi|sata|st\d{4,}|wdc|wd\s|seagate|samsung\s+ssd|intel\s+ssd|物理ディスク|固定ディスク|ハード\s*ディスク/i.test(
          desc
        );
      /** JP plain-text disks often list capacity + bytes/sector without a separate model line. */
      return hasSized && (hasSector || (diskish && (hasModel || hasDesc)));
    };

    const looksLikeDisk = (/** @type {Record<string, string>} */ f) => {
      const blob = `${Object.keys(f).join(" ")} ${Object.values(f).join(" ")}`.toLowerCase();
      return (
        !!(
          f["File System"] ||
          f["Filesystem"] ||
          f.Dateisystem ||
          f["Système de fichiers"] ||
          f["Sistema de archivos"] ||
          f["Sistema de ficheiros"] ||
          f["Файловая система"] ||
          f["ファイル システム"] ||
          f["ファイルシステム"]
        ) ||
        (!!(f["Total Size"] || f["Gesamtgröße"] || f["Taille totale"] || f["Размер"] || f["Полный размер"] || f["Ёмкость"] || f["合計サイズ"] || f["サイズ"] || f["総容量"]) &&
          !!(
            f["Free Space"] ||
            f["Available Space"] ||
            f["Freier Speicherplatz"] ||
            f["Verfügbarer Speicherplatz"] ||
            f["Espace libre"] ||
            f["Свободно"] ||
            f["Свободное место"] ||
            f["Доступно"] ||
            f["空き領域"] ||
            f["空き容量"] ||
            f["使用可能領域"] ||
            f["使用可能な容量"] ||
            f["空きの容量"] ||
            f["未使用領域"]
          )) ||
        (/ntfs|fat32|refs|exfat/i.test(blob) && /gb|tb|bytes|mb|гб|тб|バイト/i.test(blob)) ||
        looksLikePhysicalDisk(f)
      );
    };

    const driveSeenKey = (/** @type {string} */ path, /** @type {Record<string, string>} */ f) => {
      const tag =
        (f["ドライブ"] || f["Drive"] || f["Volume"] || f["ディスク"] || f["合計サイズ"] || f["Total Size"] || f["Serial Number"] || f["シリアル番号"] || "")
          .trim() || Object.keys(f).sort().join(",");
      return `${path}\u0001${tag}`;
    };

    /** @param {string} v */
    const looksLikeDriveSizeValue = (/** @type {string} */ v) => {
      const s = String(v || "").trim();
      if (!s || s.length < 2) return false;
      return /[\d.,]/.test(s) && /(tb|gb|mb|kb|bytes|байт|バイト|go|to|mo|ko)/i.test(s);
    };

    /** @param {Record<string, string>} f */
    const pickDriveUsedFromFields = (/** @type {Record<string, string>} */ f) => {
      if (!f || typeof f !== "object") return "";
      const direct =
        f["Used"] ||
        f["Used(%)"] ||
        f["% Used"] ||
        f["Belegt"] ||
        f["Utilisé"] ||
        f["Используется"] ||
        f["使用中"] ||
        f["使用済み"] ||
        f["使用中の容量"] ||
        f["使用済みの容量"] ||
        f["使用済み容量"] ||
        f["使用容量"] ||
        f["占有領域"] ||
        f["使用中の領域"] ||
        f["使用領域"] ||
        "";
      const d = String(direct || "").trim();
      if (d) return d;
      for (const [k, v] of Object.entries(f)) {
        const kk = String(k || "").trim();
        const vv = String(v || "").trim();
        if (!vv || /空き|使用可能|利用可能|未使用|free|available|unused/i.test(kk)) continue;
        if (/シリアル|serial/i.test(kk)) continue;
        if (/^使用中|^使用済|^占有/.test(kk) && /(容量|領域|サイズ|スペース|space)/i.test(kk) && looksLikeDriveSizeValue(vv)) return vv;
        if ((kk === "使用中" || kk === "使用済み") && looksLikeDriveSizeValue(vv)) return vv;
      }
      return "";
    };

    /** @param {Record<string, string>} f */
    const pickDriveVolumeNameFromFields = (/** @type {Record<string, string>} */ f) => {
      if (!f || typeof f !== "object") return "";
      const direct =
        f["Volume Name"] ||
        f["Label"] ||
        f["Datenträgerbezeichnung"] ||
        f["Nom de volume"] ||
        f["Метка тома"] ||
        f["Метка"] ||
        f["ボリューム ラベル"] ||
        f["ボリュームラベル"] ||
        f["ボリューム名"] ||
        f["ボリューム のラベル"] ||
        f["ドライブのラベル"] ||
        f["ドライブ ラベル"] ||
        "";
      const d = String(direct || "").trim();
      if (d) return d;
      for (const [k, v] of Object.entries(f)) {
        const kk = String(k || "").trim();
        const vv = String(v || "").trim();
        if (!vv || /シリアル|serial/i.test(kk)) continue;
        if (/ボリューム.*(名|ラベル)|^ラベル$/i.test(kk)) return vv;
      }
      return "";
    };

    const pushDrive = (/** @type {string} */ path, /** @type {Record<string, string>} */ f) => {
      const key = driveSeenKey(path, f);
      if (seen.has(key)) return;
      if (Object.keys(f).length < 2 || !looksLikeDisk(f)) return;
      seen.add(key);
      let title =
        f["Drive"] ||
        f.Laufwerk ||
        f["Volume"] ||
        f["Name"] ||
        f["Описание"] ||
        f["Модель"] ||
        f["ドライブ"] ||
        f["ディスク"] ||
        (path.match(/Drive\s+[A-Z]:/i) || path.match(/ドライブ\s+[A-Z]:/i) || [""])[0] ||
        path.split(" / ").pop() ||
        "Drive";
      const tTrim = String(title).trim();
      const pathDiskN = String(path || "").match(/ディスク\s*(\d+)/i);
      const titleDiskN = tTrim.match(/^ディスク\s*(\d+)$/i);
      if (titleDiskN) title = `Disk ${titleDiskN[1]}`;
      else if (/^ディスク$/i.test(tTrim) && pathDiskN) title = `Disk ${pathDiskN[1]}`;
      out.push({
        title: String(title),
        fileSystem:
          f["File System"] ||
          f.Filesystem ||
          f.Dateisystem ||
          f["Système de fichiers"] ||
          f["Sistema de archivos"] ||
          f["Sistema de ficheiros"] ||
          f["Файловая система"] ||
          f["ファイル システム"] ||
          f["ファイルシステム"] ||
          "",
        totalSize:
          f["Total Size"] ||
          f["Size"] ||
          f["Gesamtgröße"] ||
          f["Kapazität"] ||
          f["Taille totale"] ||
          f["Размер"] ||
          f["Полный размер"] ||
          f["Ёмкость"] ||
          f["合計サイズ"] ||
          f["サイズ"] ||
          f["総容量"] ||
          "",
        freeSpace:
          f["Free Space"] ||
          f["Available Space"] ||
          f["Freier Speicherplatz"] ||
          f["Verfügbarer Speicherplatz"] ||
          f["Espace libre"] ||
          f["Espace disponible"] ||
          f["Свободно"] ||
          f["Свободное место"] ||
          f["Доступно"] ||
          f["空き領域"] ||
          f["空き容量"] ||
          f["使用可能領域"] ||
          f["使用可能な容量"] ||
          f["空きの容量"] ||
          f["未使用領域"] ||
          "",
        used: pickDriveUsedFromFields(f),
        volumeName: pickDriveVolumeNameFromFields(f),
        serialNumber:
          f["Serial Number"] ||
          f["Volume Serial Number"] ||
          f["Seriennummer"] ||
          f["Серийный номер"] ||
          f["シリアル番号"] ||
          f["ボリューム シリアル番号"] ||
          "",
        path,
      });
    };

    /** JP exports split volumes on ドライブ / ローカル ディスク (C:); physical disks repeat ディスク / ディスク 1. */
    const driveRecordStartRe =
      /^(ドライブ|Drive|Volume|Laufwerk|ボリューム|ディスク(?:\s+\d+)?|ローカル\s*ディスク(?:\s*\([A-Z]:?\))?)$/i;
    const emitDrivesForPath = (/** @type {string} */ p) => {
      const chunks = chunkKvsPlainSectionRecords(kvs, p, driveRecordStartRe, 2);
      let any = false;
      for (const f of chunks) {
        if (Object.keys(f).length >= 2 && looksLikeDisk(f)) {
          pushDrive(p, f);
          any = true;
        }
      }
      if (!any) pushDrive(p, fieldsFromKvs(p));
    };

    for (const p of [...new Set(kvs.map((k) => k.path))]) {
      if (!pathIsDriveNode(p)) continue;
      emitDrivesForPath(p);
    }
    for (const r of rows) {
      if (!pathIsDriveNode(r.path)) continue;
      const key = driveSeenKey(r.path, r.fields);
      if (seen.has(key)) continue;
      pushDrive(r.path, { ...r.fields });
    }

    if (!out.length) {
      for (const p of [...new Set(kvs.map((k) => k.path))]) {
        if (
          !/Storage|Запоминающ|Накопител|Диски|Компоненты|ストレージ|ディスク|ドライブ|ボリューム|コンポーネント/i.test(p) ||
          !/Disks?|Logical|Drive|Partition|Диск|Том|ドライブ|ディスク|ボリューム|パーティション/i.test(p)
        )
          continue;
        if (/Problem|Printer|Floppy|USB.*Mass|DVD|CD-ROM|Controller\s*Host|Принтер|Накопител.*гибк/i.test(p)) continue;
        emitDrivesForPath(p);
      }
    }

    return out;
  }

  /**
   * MSInfo often uses curly quotes around paths; normalize so exe/lnk regexes match.
   * @param {string} s
   */
  function normalizeStartupCommandText(s) {
    return String(s || "")
      .replace(/\u00A0/g, " ")
      .replace(/[\u201C\u201D\u201E\u00AB\u00BB]/g, '"')
      .replace(/[\u2018\u2019]/g, "'");
  }

  /**
   * @param {Record<string, string>} f
   */
  function pickStartupNameFromFields(f) {
    if (!f || typeof f !== "object") return "";
    const direct = displayFieldByLabels(f, [
      "Name",
      "Item",
      "Program",
      "Display Name",
      "Caption",
      "Friendly name",
      "Startup Item",
      "Autostartprogramm",
      "Élément de démarrage",
      "Elemento de inicio",
      "Elemento de inicialização",
      "Elemento de arranque",
      "Elemento di avvio",
      "Opstartitem",
      "Avvio automatico",
      "Käynnistys",
      "Käynnistyskohta",
      "Käynnistyskohteet",
      "Element automatycznego uruchamiania",
      "Oppføring",
      "Oppstartsprogram",
      "Başlangıç öğesi",
      "Spouštěcí program",
      "Spouštěcí položka",
      "Käivitusprogramm",
      "Rendszerindító elem",
      "Element pornire",
      "Имя",
      "Название",
      "Программа",
      "Элемент",
      "Элемент автозагрузки",
      "启动项",
      "啟動項目",
      "スタートアップ項目",
      "시작 프로그램",
      "عنصر بدء التشغيل",
    ]);
    if (direct) return direct;
    for (const [k, v] of Object.entries(f)) {
      const kt = String(k || "").trim();
      if (/^программ/i.test(kt) && String(v || "").trim()) return String(v).trim();
    }
    return "";
  }

  /**
   * @param {Record<string, string>} f
   */
  function pickStartupCommandFromFields(f) {
    if (!f || typeof f !== "object") return "";
    const fromLabels = displayFieldByLabels(f, [
      "Command",
      "Command String",
      "Command line",
      "Command Line",
      "Command-line",
      "Command-Line",
      "Startup command",
      "Startup Command",
      "Befehl",
      "Befehlszeile",
      "Befehlszeichenfolge",
      "Línea de comandos",
      "Linha de comando",
      "Riga di comando",
      "Opdrachtregel",
      "Opdracht",
      "Komentorivi",
      "Polecenie",
      "Wiersz polecenia",
      "Comando",
      "Comando de inicio",
      "Comando de inicialização",
      "Başlat komutu",
      "Příkaz",
      "Příkazový řádek",
      "Käsk",
      "Käsurida",
      "Parancssor",
      "Comandă",
      "Команда",
      "Строка команды",
      "Параметры",
      "启动命令",
      "啟動命令",
      "コマンド",
      "시작 명령",
      "أمر التشغيل",
    ]);
    if (fromLabels) return normalizeStartupCommandText(fromLabels).trim();
    let best = "";
    for (const [k, v] of Object.entries(f)) {
      const kt = (k || "").trim();
      const s = normalizeStartupCommandText(String(v || "").trim());
      if (!s) continue;
      if (!/(\.exe|\.lnk|\.bat|\.cmd|\.msi|--processstart)/i.test(s)) continue;
      if (
        /^(location|key|registry|размещение|раздел|ключ)$/i.test(kt) ||
        /^размещ/i.test(kt) ||
        /^пользо/i.test(kt)
      ) {
        if (/^(HKLM|HKCU|HKU|HKEY_)/i.test(s) && !/\.(exe|lnk|bat|cmd|msi)/i.test(s)) continue;
      }
      if (s.length > best.length) best = s;
    }
    return best.trim();
  }

  /**
   * @param {Record<string, string>} f
   */
  function pickStartupLocationFromFields(f) {
    if (!f || typeof f !== "object") return "";
    const direct = displayFieldByLabels(f, [
      "Location",
      "Key",
      "Registry key",
      "Speicherort",
      "Ort",
      "Emplacement",
      "Ubicación",
      "Localização",
      "Posizione",
      "Locatie",
      "Placering",
      "Plassering",
      "Sijainti",
      "Asukoht",
      "Umístění",
      "Lokalizacja",
      "Konum",
      "Раздел реестра",
      "Размещение",
      "Ключ",
      "注册表项",
      "登錄機碼",
      "レジストリ キー",
      "레지스트리 키",
      "موقع التسجيل",
    ]);
    if (direct) return direct;
    for (const [k, v] of Object.entries(f)) {
      const kt = String(k || "").trim();
      if (/^размещ/i.test(kt) && String(v || "").trim()) return String(v).trim();
    }
    return "";
  }

  /**
   * @param {Record<string, string>} f
   */
  function pickStartupUserFromFields(f) {
    if (!f || typeof f !== "object") return "";
    const direct = displayFieldByLabels(f, [
      "User",
      "User Name",
      "Benutzer",
      "Usuario",
      "Utilisateur",
      "Utente",
      "Gebruiker",
      "Bruger",
      "Bruker",
      "Användare",
      "Käyttäjä",
      "Kasutaja",
      "Użytkownik",
      "Uživatel",
      "Utilizator",
      "Felhasználó",
      "Kullanıcı",
      "Пользователь",
      "Имя пользователя",
      "用户",
      "使用者",
      "ユーザー",
      "사용자",
      "المستخدم",
    ]);
    if (direct) return direct;
    for (const [k, v] of Object.entries(f)) {
      const kt = String(k || "").trim();
      if (/^пользо/i.test(kt) && String(v || "").trim()) return String(v).trim();
    }
    return "";
  }

  /**
   * When MSInfo omits Name/Item, infer a readable label from Command (exe/lnk path, --processStart, etc.).
   * @param {string} rawName
   * @param {string} command
   * @param {string} pathLeaf last category segment, if any
   */
  function deriveStartupProgramName(rawName, command, pathLeaf) {
    const n = String(rawName || "").trim();
    if (n) return n;
    const cmd = normalizeStartupCommandText(String(command || "").trim());
    const leaf = String(pathLeaf || "").trim();

    if (!cmd) {
      if (leaf && !/^[\[{]/.test(leaf)) return leaf;
      return "(unnamed)";
    }

    /** @type {string} */
    let fileName = "";

    const ps = /--processstart\s+["']?([^\s"']+)/i.exec(cmd);
    if (ps) {
      const seg = ps[1].replace(/^["']|["']$/g, "");
      fileName = seg.split(/[/\\]/).pop() || seg;
    }

    if (!fileName) {
      const quoted = cmd.match(/"([^"]+\.(?:exe|lnk|com|bat|cmd|msi|scr))"/gi);
      if (quoted && quoted.length) {
        const paths = quoted.map((q) => q.slice(1, -1));
        const prefer = paths.filter((u) => /[/\\]/.test(u));
        const pool = prefer.length ? prefer : paths;
        const pick = pool[pool.length - 1];
        fileName = pick.split(/[/\\]/).pop() || pick;
      }
    }

    if (!fileName) {
      const uq = cmd.match(/\b([a-zA-Z]:[/\\][^"\r\n]+\.(?:exe|lnk|com|bat|cmd|msi|scr))\b/i);
      if (uq) fileName = uq[1].split(/[/\\]/).pop() || uq[1];
    }

    if (!fileName) {
      const loose = cmd.match(/([^\s"']+\.(?:exe|lnk|com|bat|cmd|msi|scr))\b/i);
      if (loose) fileName = loose[1].split(/[/\\]/).pop() || loose[1];
    }

    if (!fileName) {
      const bare = /^\s*([^\r\n"]+\.lnk)\s*$/i.exec(cmd);
      if (bare) fileName = bare[1].split(/[/\\]/).pop() || bare[1];
    }

    if (!fileName) {
      if (leaf && !/^[\[{]/.test(leaf)) return leaf;
      return "(unnamed)";
    }

    fileName = fileName.replace(/^["']|["']$/g, "");
    const stem = fileName.replace(/\.(exe|lnk|com|bat|cmd|msi|scr)$/i, "").trim();
    if (!stem) return "(unnamed)";

    const compact = stem.toLowerCase().replace(/\s+/g, "");
    /** @type {Record<string, string>} */
    const known = {
      onedrive: "OneDrive",
      steam: "Steam",
      steamservice: "Steam",
      ealauncher: "EA Desktop",
      epicgameslauncher: "Epic Games Launcher",
      riotclientservices: "Riot Client",
      discord: "Discord",
      msedge: "Microsoft Edge",
      chrome: "Google Chrome",
      firefox: "Mozilla Firefox",
      teams: "Microsoft Teams",
      outlook: "Microsoft Outlook",
      spotify: "Spotify",
      slack: "Slack",
      zoom: "Zoom",
    };
    if (known[compact]) return known[compact];

    if (/^sendtoonenote$/i.test(compact) || /^send\s+to\s+onenote$/i.test(stem)) return "Send to OneNote";
    if (/onenote/i.test(stem)) return "OneNote";

    if (compact === "update" && /discord/i.test(cmd)) return "Discord";

    return stem.replace(/\b([a-z])([a-z]*)\b/gi, (_, a, rest) => a.toUpperCase() + rest.toLowerCase());
  }

  /**
   * Plain-text MSInfo sections list many records under one bracket path; merge all rows into one object
   * only keeps the last record. Split when a new “row” begins (repeated primary column label after ≥N fields).
   * @param {{ path: string, item: string, value: string }[]} kvs
   * @param {string} path
   * @param {RegExp} recordStartKey
   * @param {number} [minBeforeSplit]
   * @returns {Record<string, string>[]}
   */
  function chunkKvsPlainSectionRecords(kvs, path, recordStartKey, minBeforeSplit) {
    const minSplit = minBeforeSplit != null && minBeforeSplit > 0 ? minBeforeSplit : 2;
    /** @type {{ item: string, value: string }[][]} */
    const chunks = [];
    /** @type {{ item: string, value: string }[]} */
    let cur = [];
    for (const k of kvs) {
      if (k.path !== path) continue;
      const it = String(k.item || "").trim();
      const val = String(k.value || "").trim();
      if (!it && !val) continue;
      if (it && recordStartKey.test(it) && cur.length >= minSplit) {
        chunks.push(cur);
        cur = [];
      }
      cur.push({ item: it, value: val });
    }
    if (cur.length) chunks.push(cur);
    return chunks.map((rows) => {
      const f = {};
      for (const r of rows) {
        if (r.item) {
          f[r.item] = r.value;
        } else if (r.value && /(\.exe|\.lnk|\.bat|\.cmd|\.msi|--processstart)/i.test(r.value)) {
          if (!f.Command || r.value.length > String(f.Command).length) f.Command = r.value;
        }
      }
      return f;
    });
  }

  /**
   * @param {{ path: string, item: string, value: string }[]} kvs
   * @param {{ path: string, fields: Record<string, string> }[]} rows
   */
  function extractStartupPrograms(kvs, rows) {
    /** @type {{ name: string, command: string, location: string, user: string, path: string }[]} */
    const out = [];
    const seen = new Set();

    const startupLeafName = (/** @type {string} */ path) => {
      const parts = String(path || "")
        .split(" / ")
        .map((x) => x.trim())
        .filter(Boolean);
      return parts.length ? parts[parts.length - 1] : "";
    };

    const startupPathMentionsRunKey = (/** @type {string} */ s) =>
      /CurrentVersion\s*[/\\]\s*Run|Microsoft\\Windows\\CurrentVersion\\Run|Explorer\\Run|Policies\\.*?\\Run|\\Run\\/i.test(
        s
      );

    /** Some localized exports omit the usual “software environment” parent segment; match startup table by leaf or Run paths. */
    const startupContext = (/** @type {string} */ p) => {
      const s = String(p || "");
      const leaf = startupLeafName(s);
      const startupHint =
        /Startup Programs|Startup\s*Command|Autostart|Autostartprogramme|Programme beim Start|Programmes au démarrage|Programas de inicio|Programas de inicialização|Programas de arranque|Programmi di avvio|Autostart-programmer|Autostartprogrammer|Oppstartsprogrammer|Käynnistysohjelmat|Opstartprogramma|Opstartprogramma's|Programy startowe|Başlangıç programları|自動実行|スタートアップ\s*プログラム|スタートアッププログラム|スタートアップ|啟動|启动|자동 실행|Käivitusprogrammid|Rendszerindító|Program de pornire|Spouštěcí programy|Spouštěcí aplikace|Автозагрузка|автозагруз|элементы автозагруз|элемент автозагруз|Программы в автозагрузке|Программы автозагрузки|Программ автозагрузки|Запуск программ|启动程序|CurrentVersion\s*[/\\]\s*Run|\/\s*Run\s*(\/|$)/i.test(
          s
        ) ||
        /^(Элементы автозагрузки|Элемент автозагрузки|Программы в автозагрузке|Программы автозагрузки|Автозагрузка|Запуск программ|Startup Programs|Autostart|Käynnistysohjelmat|Opstartprogramma|Programy startowe|スタートアップ\s*プログラム|スタートアッププログラム)$/i.test(
          leaf
        );
      if (!startupHint) return false;
      if (
        /(^|\/)(Services|Dienste|Службы|Сервисы|Palvelut|Tjenester|Tjänster|Usługi|Hizmetler|الخدمات|服务|服務|서비스|サービス|Teenused|Υπηρεσίες|Szolgáltatások|Servicii|Služby)(\/|$)/i.test(
          s
        ) &&
        !/автозагруз|autostart|startup\s*programs|элемент|käynnistys|arranque|avvio|スタートアップ/i.test(s)
      ) {
        return false;
      }
      if (/Task\s*Scheduler|Scheduled\s*Tasks|Geplante Tasks|Tâches planifiées|Планировщик|Tehtäväaikataulu|Aktivitetstavler|Opgavestyring/i.test(s))
        return false;
      return (
        MSINFO_I18N.softwareEnvPath.test(s) ||
        startupPathMentionsRunKey(s) ||
        /^(Элементы автозагрузки|Элемент автозагрузки|Программы в автозагрузке|Программы автозагрузки|Автозагрузка|Запуск программ|Startup Programs|Autostart|Käynnistysohjelmat|Opstartprogramma|Programy startowe|スタートアップ\s*プログラム|スタートアッププログラム)$/i.test(
          leaf
        )
      );
    };

    const startupRecordStartRe =
      /^(名前|名称|表示名|スタートアップ項目|スタートアップ\s*項目|Startup\s*Item|Item|Program|プログラム)$/i;

    for (const p of [...new Set(kvs.map((k) => k.path))]) {
      if (!startupContext(p)) continue;
      const fieldMaps = chunkKvsPlainSectionRecords(kvs, p, startupRecordStartRe);
      for (const f of fieldMaps) {
        const rawName = pickStartupNameFromFields(f);
        const cmd = pickStartupCommandFromFields(f);
        const pathLeaf = p.split(" / ").pop() || "";
        if (!rawName.trim() && !cmd.trim()) continue;
        const dedupe = `${p}|${rawName}|${cmd}|${pickStartupLocationFromFields(f)}|${pickStartupUserFromFields(f)}`;
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);
        out.push({
          name: deriveStartupProgramName(rawName, cmd, pathLeaf),
          command: cmd,
          location: pickStartupLocationFromFields(f),
          user: pickStartupUserFromFields(f),
          path: p,
        });
      }
    }

    for (const r of rows) {
      if (!startupContext(r.path)) continue;
      const f = r.fields;
      const rawName = pickStartupNameFromFields(f);
      const cmd = pickStartupCommandFromFields(f);
      if (!rawName.trim() && !cmd.trim()) continue;
      const pathLeaf = r.path.split(" / ").pop() || "";
      const displayName = deriveStartupProgramName(rawName, cmd, pathLeaf);
      const loc = pickStartupLocationFromFields(f);
      const usr = pickStartupUserFromFields(f);
      const key = `${r.path}|${rawName}|${cmd}|${loc}|${usr}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        name: displayName,
        command: cmd,
        location: loc,
        user: usr,
        path: r.path,
      });
    }

    if (!out.length) {
      const junkPath = (/** @type {string} */ p) =>
        /(^|\/)(службы|services|サービス)(\/|$)/i.test(p) ||
        (/memory|память|storage|диск|network|сеть|принтер|printer/i.test(p) &&
          !/автозагруз|startup|run\\/i.test(p));
      for (const r of rows) {
        if (junkPath(r.path)) continue;
        const f = r.fields;
        const rawName = pickStartupNameFromFields(f);
        const cmd = pickStartupCommandFromFields(f);
        if (!rawName.trim() || !cmd.trim()) continue;
        if (Object.keys(f).length < 2) continue;
        const pathLeaf = r.path.split(" / ").pop() || "";
        const displayName = deriveStartupProgramName(rawName, cmd, pathLeaf);
        const loc = pickStartupLocationFromFields(f);
        const usr = pickStartupUserFromFields(f);
        const key = `heur|${r.path}|${rawName}|${cmd}|${loc}|${usr}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ name: displayName, command: cmd, location: loc, user: usr, path: r.path });
      }
    }

    return out.slice(0, 400);
  }

  /**
   * @param {{ path: string, item: string, value: string }[]} kvs
   * @param {{ path: string, fields: Record<string, string> }[]} rows
   * @returns {{ all: { name: string, state: string, startMode: string, path: string }[], running: { name: string, state: string, startMode: string, path: string }[] }}
   */
  function extractServicesBundle(kvs, rows) {
    /** @type {{ name: string, state: string, startMode: string, path: string }[]} */
    const all = [];
    const seen = new Set();

    const dedupKey = (/** @type {string} */ p, /** @type {string} */ n) => `${p}::${n}`;

    /** Plain-text JP exports sometimes merge the table header into the first “service” record. */
    const looksLikeMsinfoJpServiceTableHeaderGarbage = (/** @type {string} */ name) => {
      const n = String(name || "").trim();
      if (!n) return false;
      if (/名前\s+状態\s+起動モード|起動モード\s+サービス|項目\s+値/.test(n)) return true;
      if (n.length > 60 && /名前/.test(n) && /起動モード/.test(n) && /状態/.test(n)) return true;
      return false;
    };

    /** @param {Record<string, string>} f */
    const pickServiceStateFromFields = (f) => {
      if (!f || typeof f !== "object") return "";
      const direct =
        f.State ||
        f.Status ||
        f["Current State"] ||
        f["Aktueller Status"] ||
        f.Zustand ||
        f["Состояние"] ||
        f["Статус"] ||
        f["Текущее состояние"] ||
        f["Текущий статус"] ||
        f["Текущее состояние службы"] ||
        f["État"] ||
        f["Stato"] ||
        f["Estado"] ||
        f["Estado actual"] ||
        f["Status atual"] ||
        f["Huidige status"] ||
        f["Aktuel tilstand"] ||
        f["Aktuell status"] ||
        f["Nykyinen tila"] ||
        f["Praegune olek"] ||
        f["Aktuálny stav"] ||
        f["Aktuální stav"] ||
        f["Stan"] ||
        f["Stare"] ||
        f["Állapot"] ||
        f["Durum"] ||
        f["Κατάσταση"] ||
        f["현재 상태"] ||
        f["当前状态"] ||
        f["狀態"] ||
        f["状態"] ||
        f["現在の状態"] ||
        f["الحالة"] ||
        "";
      const d = String(direct || "").trim();
      if (d && !/^недоступно$/i.test(d)) return d;
      for (const [k, v] of Object.entries(f)) {
        const kt = String(k || "").trim();
        const vv = String(v || "").trim();
        if (!vv || /^недоступно$/i.test(vv)) continue;
        if (
          /^(state|status|zustand|состояни|статус|текущ|état|estado|stato|stan|tila|tilstand|állapot|durum|κατάσταση|상태|状态|狀態|状態|現在の状態|الحالة)/i.test(
            kt
          )
        )
          return vv;
        if (/^состоян/i.test(kt) && !/шаблон|template/i.test(kt)) return vv;
      }
      return "";
    };

    /** @param {Record<string, string>} f */
    const pickServiceStartModeFromFields = (f) => {
      if (!f || typeof f !== "object") return "";
      const direct =
        f["Startup Type"] ||
        f["Start Mode"] ||
        f["Start type"] ||
        f.Startup ||
        f["Starttyp"] ||
        f["Startmodus"] ||
        f["Тип запуска"] ||
        f["Тип_запуска"] ||
        f["Режим запуска"] ||
        f["Режим_запуска"] ||
        f["Typ uruchomienia"] ||
        f["Typ spouštění"] ||
        f["Spouštěcí typ"] ||
        f["Käynnistystyyppi"] ||
        f["Käivitustüüp"] ||
        f["Starttype"] ||
        f["Opstarttype"] ||
        f["Tipo de inicio"] ||
        f["Tipo de inicialização"] ||
        f["Tipo di avvio"] ||
        f["Type de démarrage"] ||
        f["Başlangıç türü"] ||
        f["Tipo de arranque"] ||
        f["Indítás típusa"] ||
        f["Tip pornire"] ||
        f["Τύπος εκκίνησης"] ||
        f["시작 유형"] ||
        f["启动类型"] ||
        f["啟動類型"] ||
        f["起動の種類"] ||
        f["起動モード"] ||
        f["スタートの種類"] ||
        f["スタートのモード"] ||
        f["نوع بدء التشغيل"] ||
        "";
      const d = String(direct || "").trim();
      if (d && !/^недоступно$/i.test(d)) return d;
      for (const [k, v] of Object.entries(f)) {
        const kt = String(k || "").trim();
        const vv = String(v || "").trim();
        if (!vv || /^недоступно$/i.test(vv)) continue;
        if (
          /^(startup|start\s*type|starttyp|запуск|тип\s*запуска|typ\s*uruchomienia|spouštěcí|käynnistys|käivitus|opstart|tipo\s*de\s*inicio|tipo\s*di\s*avvio|type\s*de\s*démarrage|başlangıç|indítás|tip\s*pornire|τύπος\s*εκκίνησης|시작|启动|啟動|起動|スタート|نوع)/i.test(
            kt
          )
        )
          return vv;
        if (/起動/.test(kt) && /(種類|モード|タイプ)/.test(kt)) return vv;
        if (/^режим/i.test(kt) && /запуск/i.test(kt)) return vv;
        if (/^тип/i.test(kt) && /запуск/i.test(kt)) return vv;
      }
      return "";
    };

    /** @param {Record<string, string>} f @param {string} pathLeaf */
    const pickServiceNameFromFields = (f, pathLeaf) => {
      if (!f || typeof f !== "object") return pathLeaf || "";
      return (
        f["Выводимое_имя"] ||
        f["Выводимое имя"] ||
        f["Display Name"] ||
        f["Anzeigename"] ||
        f["Weergavenaam"] ||
        f["Visningsnavn"] ||
        f["Visningsnamn"] ||
        f["Näyttönimi"] ||
        f["Zobrazovaný název"] ||
        f["Zobrazovaný názov"] ||
        f["Wyświetlana nazwa"] ||
        f["Megjelenítendő név"] ||
        f["Nume afișat"] ||
        f["Nome visualizzato"] ||
        f["Nome de exibição"] ||
        f["Nombre para mostrar"] ||
        f["Görünen ad"] ||
        f["Εμφανιζόμενο όνομα"] ||
        f["サービス名"] ||
        f["表示名"] ||
        f["名前"] ||
        f["표시 이름"] ||
        f["显示名称"] ||
        f["顯示名稱"] ||
        f["الاسم المعروض"] ||
        f.Name ||
        f["Имя"] ||
        f["Service Name"] ||
        f["Dienstname"] ||
        f.Service ||
        f["Отображаемое имя"] ||
        f["Имя службы"] ||
        f["Название службы"] ||
        pathLeaf ||
        ""
      );
    };

    /** @param {string} st */
    const isRunningServiceState = (st) => {
      const s = String(st || "").trim();
      if (!s || /^недоступно$/i.test(s)) return false;
      return (
        /\brunning\b/i.test(s) ||
        /\bRUNNING\b/.test(s) ||
        /^started$/i.test(s) ||
        /\bgestartet\b/i.test(s) ||
        /\bwird ausgeführt\b/i.test(s) ||
        /\bläuft\b/i.test(s) ||
        /\ben cours d['']exécution\b/i.test(s) ||
        /\bfuncionando\b/i.test(s) ||
        /\battivo\b/i.test(s) ||
        /\bactivo\b/i.test(s) ||
        /\bactief\b/i.test(s) ||
        /\baktiv\b/i.test(s) ||
        /\baktiivinen\b/i.test(s) ||
        /\baktivní\b/i.test(s) ||
        /\bdziała\b/i.test(s) ||
        /\buruchomiony\b/i.test(s) ||
        /\bkører\b/i.test(s) ||
        /\bkörs\b/i.test(s) ||
        /\bkäynnissä\b/i.test(s) ||
        /\bkjører\b/i.test(s) ||
        /\bçalışıyor\b/i.test(s) ||
        /正在运行/.test(s) ||
        /実行中/.test(s) ||
        /실행 중/.test(s) ||
        /قيد التشغيل/.test(s) ||
        /λειτουργεί/i.test(s) ||
        /\bвыполняется\b/i.test(s) ||
        /\bзапущен[ао]?\b/i.test(s) ||
        /\bзапущено\b/i.test(s) ||
        /\bработает\b/i.test(s) ||
        /\bв работе\b/i.test(s) ||
        /\bактивн[аоы]?\b/i.test(s) ||
        /\bидёт\s+выполнение\b/i.test(s) ||
        /\bидет\s+выполнение\b/i.test(s) ||
        /\boperat(ing|ional)\b/i.test(s) ||
        /service\s+is\s+running/i.test(s) ||
        (/^\s*\d+\s*[-–—]?\s*/.test(s) && /\b(выполня|работа|running|läuft)\b/i.test(s))
      );
    };

    const pathParts = (/** @type {string} */ p) =>
      String(p || "")
        .split(" / ")
        .map((s) => s.trim())
        .filter(Boolean);

    /** Windows Services table is often "... / Службы" with no per-service path segment; older matchers required another path segment and missed flat tables. */
    const isServicesSectionPath = (/** @type {string} */ p) => {
      if (!MSINFO_I18N.softwareEnvPath.test(p)) return false;
      if (
        /startup|autostart|автозагруз|планировщик|task\s*scheduler|scheduled\s*tasks|tâches planifiées|geplante tasks|スタートアップ\s*プログラム|スタートアッププログラム/i.test(
          p
        )
      )
        return false;
      if (/print\s*spooler\s*drivers|enumerators|принтер|spooler|druckertreiber/i.test(p)) return false;
      if (/системные драйверы|system\s*drivers/i.test(p)) return false;
      if (/Drivers$|Druckertreiber$/i.test(p)) return false;
      const parts = pathParts(p);
      const idx = parts.findIndex((s) =>
        /^(services|dienste|servicios|serviços|servizi|службы|сервисы|запущенные\s+службы|работающие\s+службы|palvelut|tjenester|tjänster|usługi|hizmetler|الخدمات|服务|服務|서비스|サービス|実行中のサービス|起動しているサービス|teenused|υπηρεσίες|szolgáltatások|servicii|služby|käynnissä\s+olevat\s+palvelut|uruchomione\s+usługi|çalışan\s+hizmetler)$/iu.test(
          s
        )
      );
      return idx >= 0;
    };

    const serviceRecordStartRe =
      /^(表示名|サービス名|Display Name|Service Name|サービス\s*名|Отображаемое имя|Имя службы|Имя\s*службы|Dienstname|Nom du service|Nombre del servicio)$/i;

    for (const p of [...new Set(kvs.map((k) => k.path))]) {
      if (!isServicesSectionPath(p)) continue;
      const fieldMaps = chunkKvsPlainSectionRecords(kvs, p, serviceRecordStartRe, 3);
      for (const f of fieldMaps) {
        const pathLeaf = p.split(" / ").pop() || "";
        const name = pickServiceNameFromFields(f, pathLeaf);
        if (!name || !String(name).trim()) continue;
        if (looksLikeMsinfoJpServiceTableHeaderGarbage(name)) continue;
        const k0 = dedupKey(p, name);
        if (seen.has(k0)) continue;
        seen.add(k0);
        const state = pickServiceStateFromFields(f);
        const startMode = pickServiceStartModeFromFields(f);
        all.push({ name: String(name), state: String(state), startMode: String(startMode), path: p });
      }
    }

    for (const r of rows) {
      if (!isServicesSectionPath(r.path)) continue;
      const f = r.fields;
      const pathLeaf = r.path.split(" / ").pop() || "";
      const name = pickServiceNameFromFields(f, pathLeaf);
      if (!name) continue;
      if (looksLikeMsinfoJpServiceTableHeaderGarbage(name)) continue;
      const k0 = dedupKey(r.path, name);
      if (seen.has(k0)) continue;
      seen.add(k0);
      const state = pickServiceStateFromFields(f);
      const startMode = pickServiceStartModeFromFields(f);
      all.push({ name: String(name), state: String(state), startMode: String(startMode), path: r.path });
    }

    const running = all.filter((s) => {
      if (isRunningServiceState(s.state || "")) return true;
      const st = String(s.state || "").trim();
      if (st && /^недоступно$/i.test(st)) return false;
      const p = String(s.path || "");
      return (
        !!(s.name || "").trim() &&
        (/\b(запущенн[\s\w,.-]{0,40}служб|работающ[\s\w,.-]{0,40}служб)\b/i.test(p) ||
          /実行中のサービス|起動しているサービス/.test(p))
      );
    });
    return { all: all.slice(0, 800), running: running.slice(0, 400) };
  }

  /**
   * @typedef {{ time: string, type: string, details: string, severity: 'error'|'warning'|'info', category: string, sourceTitle: string, path: string }} WerTimelineEntry
   */

  /** @param {Record<string, string>} fields @param {RegExp[]} patterns */
  function werFirstFieldMatch(fields, patterns) {
    for (const [k, v] of Object.entries(fields)) {
      const kt = k.trim();
      const vv = String(v || "").trim();
      if (!vv) continue;
      for (const re of patterns) {
        if (re.test(kt)) return vv;
      }
    }
    return "";
  }

  /** @param {Record<string, string>} fields */
  function werPickTime(fields) {
    return werFirstFieldMatch(fields, [
      /^time$/i,
      /^heure$/i,
      /^hora$/i,
      /^zeit$/i,
      /^data\s*[\/\u2215]\s*ora$/i,
      /^fecha$/i,
      /^時間$/i,
      /^时间$/i,
      /^время$/i,
      /^время_/i,
      /^время\b/i,
      /^czas$/i,
      /^čas$/i,
      /^tid$/i,
      /^tidspunkt$/i,
      /^saat$/i,
      /^aeg$/i,
      /^kellonaika$/i,
      /^وقت$/i,
      /^日時$/i,
      /^時刻$/i,
      /^記録日時$/i,
      /^記録された日時$/i,
    ]);
  }

  /** @param {Record<string, string>} fields */
  function werPickType(fields) {
    const t =
      werFirstFieldMatch(fields, [
        /^type$/i,
        /^tipo$/i,
        /^typ$/i,
        /^event\s*name$/i,
        /^nome\s*evento$/i,
        /^nom\s*de\s*l['\u2019]?événement$/i,
        /^事件名称$/i,
        /^イベント名$/i,
        /^тип$/i,
        /^тип_/i,
        /^тип\b/i,
        /^fehlertyp$/i,
        /^fault\s*bucket$/i,
        /^bucket\s*id$/i,
        /^tyyppi$/i,
        /^tür$/i,
        /^typ\s+problemu$/i,
        /^type\s+de\s+probl/i,
        /^tipo\s+de\s+problema$/i,
        /^tipo\s+di\s+problema$/i,
        /^probleemtype$/i,
        /^probleemtypen$/i,
      ]) || "";
    if (t) return t;
    const fb = werFirstFieldMatch(fields, [
      /fault/i,
      /wer\s*report/i,
      /problem\s*signature/i,
      /ошибк/i,
      /отчет/i,
      /livekernel/i,
    ]);
    return fb || "";
  }

  /** @param {Record<string, string>} fields */
  function werPickDetails(fields) {
    const d =
      werFirstFieldMatch(fields, [
        /^details$/i,
        /^détails$/i,
        /^detalles$/i,
        /^dettagli$/i,
        /^detalhes$/i,
        /^詳細$/i,
        /^详细信息$/i,
        /^сведения$/i,
        /^сведения_/i,
        /^сведен/i,
        /^подробности$/i,
        /^szczegóły$/i,
        /^açıklama$/i,
        /^описание$/i,
        /^описан/i,
        /^詳細情報$/i,
        /^تفاصيل$/i,
        /^részletek$/i,
        /^yksityiskohdat$/i,
        /^podrobnosti$/i,
        /^detaljer$/i,
      ]) || "";
    if (d) return d;
    /** @type {string[]} */
    const skip = [];
    const time = werPickTime(fields);
    const typ = werPickType(fields);
    if (time) skip.push(time);
    if (typ) skip.push(typ);
    const parts = [];
    for (const [k, v] of Object.entries(fields)) {
      const vv = String(v || "").trim();
      if (!vv || vv.length > 4000) continue;
      if (skip.includes(vv)) continue;
      if (/^response\s*info$/i.test(k.trim()) && vv.length < 20) continue;
      parts.push(`${k.trim()}: ${vv}`);
    }
    return parts.slice(0, 24).join("\n");
  }

  /** @param {string} type @param {string} details */
  function werCategorize(type, details) {
    const t = `${type} ${details}`.toLowerCase();
    if (
      /appcrash|application|\.exe|faulting\s*application|app\s*error|ошибк.*приложен|приложени.*ошиб|сбой\s*прилож/i.test(
        t
      )
    )
      return "Application";
    if (/driver|nvlddmkm|dxgmms|sys\b|\.sys/i.test(t)) return "Drivers";
    if (
      /bsod|kernel|livekernel|bugcheck|system\s*error|kmode|hardware|disk|memory|cpu|gpu|device/i.test(t)
    ) {
      return "System";
    }
    if (/network|tcp|dns|winsock|wifi|ethernet/i.test(t)) return "Network";
    if (/security|firewall|defender|malware|virus/i.test(t)) return "Security";
    if (/service\s|svchost|wuauserv/i.test(t)) return "Services";
    return "Other";
  }

  /** @param {string} type @param {string} details */
  function werSeverity(type, details) {
    const x = `${type} ${details}`.toLowerCase();
    if (/critical|bsod|bugcheck|livekernel|kernel\s*power|0xc000021a|критич|синий\s*экран|журнал\s*ошибок\s*ядра/i.test(x))
      return "error";
    if (
      /appcrash|application\s*error|exception|fault|driver\s*stopped|stopped\s*responding|ошибк.*приложен|исключен|сбой/i.test(
        x
      )
    )
      return "warning";
    return "info";
  }

  /** @param {string} time @param {string} type @param {string} details @param {string} path @param {string} sourceTitle */
  function werMakeEntry(time, type, details, path, sourceTitle) {
    const ti = (time || "").trim() || "Unknown time";
    const ty = (type || "").trim() || "Windows Error Reporting";
    const de = (details || "").trim() || "No details in export.";
    return {
      time: ti,
      type: ty,
      details: de,
      severity: /** @type {'error'|'warning'|'info'} */ (werSeverity(ty, de)),
      category: werCategorize(ty, de),
      sourceTitle: sourceTitle || path.split(" / ").slice(-2).join(" / ") || path,
      path,
    };
  }

  /**
   * Split Item/Value kvs for one path into multiple records when "Time" (or locale equivalent) repeats.
   * @param {{ path: string, item: string, value: string }[]} pathKvs
   * @param {string} path
   * @param {string} sourceTitle
   * @returns {WerTimelineEntry[]}
   */
  function werEntriesFromSegmentedKvs(pathKvs, path, sourceTitle) {
    const anchorRes = [
      /^time$/i,
      /^heure$/i,
      /^hora$/i,
      /^zeit$/i,
      /^data\s*[\/\u2215]\s*ora$/i,
      /^時間$/i,
      /^时间$/i,
      /^日時$/i,
      /^時刻$/i,
      /^記録日時$/i,
      /^記録された日時$/i,
      /^время$/i,
      /^время_/i,
      /^время\b/i,
    ];
    const isAnchor = (/** @type {string} */ item) => {
      const it = (item || "").trim();
      return anchorRes.some((re) => re.test(it));
    };

    /** @type {Record<string, string>[]} */
    const chunks = [];
    /** @type {Record<string, string>} */
    let cur = {};
    for (const k of pathKvs) {
      const item = (k.item || "").trim();
      if (!item) continue;
      if (isAnchor(item) && Object.keys(cur).length && cur[item]) {
        chunks.push(cur);
        cur = {};
      }
      cur[item] = (k.value || "").trim();
    }
    if (Object.keys(cur).length) chunks.push(cur);

    if (chunks.length === 0 && pathKvs.length) {
      const merged = {};
      for (const k of pathKvs) {
        const it = (k.item || "").trim();
        if (!it) continue;
        merged[it] = (k.value || "").trim();
      }
      if (Object.keys(merged).length) chunks.push(merged);
    }

    /** @type {WerTimelineEntry[]} */
    const out = [];
    for (const f of chunks) {
      const time = werPickTime(f);
      const typ = werPickType(f);
      const det = werPickDetails(f);
      if (!time && !typ && (!det || det.length < 3)) continue;
      out.push(werMakeEntry(time, typ, det, path, sourceTitle));
    }
    if (out.length === 0 && chunks.length) {
      const merged = chunks.reduce((acc, ch) => ({ ...acc, ...ch }), {});
      const det =
        werPickDetails(merged) ||
        Object.entries(merged)
          .map(([k, v]) => `${k}: ${v}`)
          .join("\n")
          .slice(0, 8000);
      if (det.length >= 3) {
        out.push(werMakeEntry(werPickTime(merged), werPickType(merged), det, path, sourceTitle));
      }
    }
    return out;
  }

  /** @param {Record<string, string>} fields @param {string} path */
  function werEntryFromRowFields(fields, path) {
    const time = werPickTime(fields);
    const typ = werPickType(fields);
    const det = werPickDetails(fields);
    const title = path.split(" / ").slice(-2).join(" / ") || path;
    if (!time && !typ && (!det || det.length < 3)) return null;
    return werMakeEntry(time, typ, det, path, title);
  }

  /** @param {WerTimelineEntry[]} entries */
  function werAnalyze(entries) {
    let criticalCount = 0;
    const types = new Set();
    /** @type {Date[]} */
    const dates = [];
    for (const e of entries) {
      if (e.severity === "error") criticalCount++;
      if (e.type) types.add(e.type.slice(0, 120));
      const d = Date.parse(e.time);
      if (!Number.isNaN(d)) dates.push(new Date(d));
    }
    let timeSpan = 0;
    if (dates.length > 1) {
      dates.sort((a, b) => a - b);
      timeSpan = Math.max(1, Math.ceil((dates[dates.length - 1] - dates[0]) / (86400000)));
    } else if (dates.length === 1) {
      timeSpan = 1;
    }
    return { criticalCount, uniqueTypes: types.size, timeSpan };
  }

  /**
   * @param {{ path: string, item: string, value: string }[]} kvs
   * @param {{ path: string, fields: Record<string, string> }[]} rows
   * @returns {WerTimelineEntry[]}
   */
  function extractWindowsErrorReports(kvs, rows) {
    const pathOk = (/** @type {string} */ p) => {
      const s = String(p || "");
      const hit =
        /Windows Error Reporting|Problem Reports|Reliability|WER|Report\s*Archive|Fault\s*Bucket/i.test(s) ||
        /Windows\s*エラー報告|エラー\s*報告|ソフトウェア環境.*エラー|エラー\s*コンテナ/i.test(s) ||
        /Отчеты об ошибках|Отчёт об ошибках|отчетов об ошибках|Сообщения об ошибках|сообщения об ошибках|Журнал ошибок Windows|архив отчетов|архив отчётов|надежност|диагностическ/i.test(
          s
        ) ||
        /Rapportering av feil|Feilrapportering|Fejlrapportering|Fejlrapport|Problemrapporter|Rapports de problèmes|Rapporti di problemi|Segnalazione problemi|Informes de problemas|Relatórios de problemas|Probleemrapporten|Foutrapportage|Windows-foutrapportage|Zgłaszanie błędów|Raportowanie błędów|Vianmääritys|Virheraportointi|Fejlfindingsrapport|Problémabehandler|Hibajelentések|Raportare erori|Windows hibajelentések|Windows-fouten|Raporty o błędach|Relatórios de erros do Windows|Relatório de erros|Windows-felrapportering|Rapportering av Windows|Windows-probleemrapporten|تقارير المشكلات|تقارير الأخطاء|问题报告|問題報告|問題のレポート|Windows 오류 보고|Αναφορές σφαλμάτων|Aruanded|Windowsi veateated/i.test(
          s
        );
      if (!hit) return false;
      if (
        /Group\s*Policy|Registry\s*key|групповых\s*политик|раздел\s*реестра|グループ\s*ポリシー|レジストリ\s*キー|レジストリのキー/i.test(
          s
        )
      )
        return false;
      return true;
    };

    /** @param {WerTimelineEntry} a @param {WerTimelineEntry} b */
    const byTimeDesc = (a, b) => {
      const da = Date.parse(a.time);
      const db = Date.parse(b.time);
      if (!Number.isNaN(da) && !Number.isNaN(db)) return db - da;
      if (!Number.isNaN(da)) return -1;
      if (!Number.isNaN(db)) return 1;
      return 0;
    };

    /** @type {WerTimelineEntry[]} */
    const list = [];
    const dedupe = new Set();

    const pushDeduped = (/** @type {WerTimelineEntry} */ e) => {
      const key = `${e.time}|${e.type}|${e.details.slice(0, 240)}`;
      if (dedupe.has(key)) return;
      dedupe.add(key);
      list.push(e);
    };

    for (const r of rows) {
      if (!pathOk(r.path)) continue;
      const ent = werEntryFromRowFields(r.fields, r.path);
      if (ent) pushDeduped(ent);
    }

    const pathsFromKvs = [...new Set(kvs.map((k) => k.path))].filter(pathOk);
    for (const p of pathsFromKvs) {
      const pathKvs = kvs.filter((k) => k.path === p);
      const title = p.split(" / ").slice(-2).join(" / ") || p;
      const fromSeg = werEntriesFromSegmentedKvs(pathKvs, p, title);
      if (fromSeg.length) {
        for (const e of fromSeg) pushDeduped(e);
      }
    }

    list.sort(byTimeDesc);
    return list.slice(0, 150);
  }

  /**
   * Localized MSInfo category paths (Windows UI strings embedded in .nfo paths).
   * Covers common display languages used with MSInfo exports.
   */
  const MSINFO_I18N = {
    summaryPath:
      /System Summary|Systemübersicht|Résumé du système|Resumo do sistema|Resumen del sistema|Informações do sistema|Informazioni di sistema|Informace o systému|Podsumowanie systemu|Přehled systému|Systemoversigt|Systeemoverzicht|Systemöversikt|Systemoversikt|Järjestelmäyhteenveto|Süsteemi kokkuvõte|Zusammenfassung|Rendszerösszefoglaló|Rezumat sistem|Sistem özeti|ملخص النظام|系统摘要|系統摘要|システムの要約|システムの概要|システム概要|시스템 요약|Επισκόπηση συστήματος|Σύνοψη συστήματος|Сводка о системе|Сведения о системе|Сводка системы|Сведения системы|Информация о системе|Обзор системы|Системные сведения|Основные сведения|Общие сведения/i,
    softwareEnvPath:
      /Software Environment|Softwareumgebung|Software-omgeving|Softwareomgeving|Environnement logiciel|Entorno de software|Ambiente de software|Ambiente software|Programvarumiljö|Softwaremiljø|Softwarové prostředí|Środowisko programowe|Szoftverkörnyezet|Yazılım ortamı|Tarkvara keskkond|Mediu software|Ohjelmistoympäristö|Περιβάλλον λογισμικού|بيئة البرامج|软件环境|軟體環境|ソフトウェア環境|ソフトウェア\s*環境|スタートアップ\s*プログラム|スタートアッププログラム|サービス|実行中のサービス|起動しているサービス|소프트웨어 환경|Программная среда|Программное обеспечение|Сведения о программном обеспечении|Среда программ|Элементы автозагрузки|Программы в автозагрузке|Программы автозагрузки|Программ автозагрузки|Автозагрузка программ|Автозагрузка/i,
    memoryRowPath:
      /System Summary|Systemübersicht|Résumé du système|Resumen del sistema|Resumo do sistema|Memory|Arbeitsspeicher|Mémoire|Memoria|Memória|Virtual Memory|Virtueller Arbeitsspeicher|Mémoire virtuelle|Memoria virtual|Memória virtual|Virtueel geheugen|Virtuellt minne|Virtuel hukommelse|Virtuaalinen muisti|Virtuaalimuisti|Wirtualna pamięć|Sanal bellek|Memorie virtuală|Virtuaalmälu|virtuální paměť|虚拟内存|虛擬記憶體|仮想メモリ|メモリの要約|メモリ\s*リソース|가상 메모리|Виртуальная память|Память|Оперативная память|Физическая память|Сводка о системе|Сведения о системе|Сводка системы|Сведения системы|Информация о системе|Обзор системы|Системные сведения|系统摘要|系統摘要|Järjestelmäyhteenveto|Podsumowanie systemu|Přehled systému|Systeemoverzicht|Systemoversigt|Systemöversikt|Systemoversikt|Süsteemi kokkuvõte|Informazioni di sistema|Sistem özeti|ملخص النظام|システムの要約|システムの概要|시스템 요약|Σύνοψη συστήματος|Επισκόπηση συστήματος|Pagineringssökväg|Auslagerungsdatei|分页文件/i,
    /** @param {RegExp | RegExp[]} labelRe */
    itemPatterns(labelRe) {
      return Array.isArray(labelRe) ? labelRe : [labelRe];
    },
  };

  /**
   * True when an MSInfo category path is the localized “system summary” table (or parent chain contains it).
   * Some locales use wording not covered by {@link MSINFO_I18N.summaryPath} alone.
   * @param {string} p
   */
  function msinfoSummaryPathMatches(p) {
    const s = String(p || "");
    if (MSINFO_I18N.summaryPath.test(s)) return true;
    return /Сводка о системе|Сведения о системе|Сводка системы|Сведения системы|Системные сведения|Основные сведения|Общие сведения|システムの要約/i.test(
      s
    );
  }

  /**
   * @param {RegExp | RegExp[]} labelRe
   * @param {{ path: string, item: string, value: string }[]} kvs
   * @param {{ path: string, fields: Record<string, string> }[]} rows
   */
  function pickSummaryMemoryI18n(labelRe, kvs, rows) {
    const patterns = MSINFO_I18N.itemPatterns(labelRe);
    const kvPathOk = (/** @type {string} */ p) =>
      msinfoSummaryPathMatches(p) || MSINFO_I18N.memoryRowPath.test(p);
    for (const labelPat of patterns) {
      let v = (
        kvs.find((k) => msinfoSummaryPathMatches(k.path) && labelPat.test((k.item || "").trim()))?.value || ""
      ).trim();
      if (v) return v;
      v = (
        kvs.find((k) => kvPathOk(k.path) && labelPat.test((k.item || "").trim()))?.value || ""
      ).trim();
      if (v) return v;
      for (const r of rows) {
        if (!kvPathOk(r.path)) continue;
        for (const [k, val] of Object.entries(r.fields)) {
          if (labelPat.test(k.trim()) && String(val).trim()) return String(val).trim();
        }
      }
    }
    return "";
  }

  /**
   * @param {RegExp | RegExp[]} itemRes
   * @param {{ path: string, item: string, value: string }[]} kvs
   */
  function kvFromSummaryI18n(itemRes, kvs) {
    const patterns = MSINFO_I18N.itemPatterns(itemRes);
    for (const itemRegex of patterns) {
      const v = (
        kvs.find((k) => msinfoSummaryPathMatches(k.path) && itemRegex.test((k.item || "").trim()))?.value || ""
      ).trim();
      if (v) return v;
    }
    return "";
  }

  /**
   * @param {RegExp | RegExp[]} itemRes
   * @param {{ path: string, fields: Record<string, string> }[]} rows
   */
  function fieldFromRowsI18n(itemRes, rows) {
    const patterns = MSINFO_I18N.itemPatterns(itemRes);
    for (const re of patterns) {
      for (const r of rows) {
        for (const [k, v] of Object.entries(r.fields)) {
          if (re.test(k.trim()) && v && String(v).trim()) return String(v).trim();
        }
      }
    }
    return "";
  }

  /**
   * Row field match limited to paths that look like System Summary (not drivers, IRQ, etc.).
   * Stops short labels such as Russian «Тип» from binding the wrong table in localized .nfo exports.
   * @param {RegExp | RegExp[]} itemRes
   * @param {{ path: string, fields: Record<string, string> }[]} rows
   */
  function fieldFromRowsSummaryPathOnly(itemRes, rows) {
    const patterns = MSINFO_I18N.itemPatterns(itemRes);
    for (const re of patterns) {
      for (const r of rows) {
        if (!msinfoSummaryPathMatches(r.path)) continue;
        for (const [k, v] of Object.entries(r.fields)) {
          if (re.test(k.trim()) && v && String(v).trim()) return String(v).trim();
        }
      }
    }
    return "";
  }

  /**
   * Russian (and some builds) use the short label «Тип» on many tables; kvs order can surface a driver row first.
   * Prefer values that look like a PC / architecture summary, not «драйвер ядра» etc.
   * @param {{ path: string, item: string, value: string }[]} kvs
   */
  function pickSystemTypeFromBareTypKvs(kvs) {
    const cand = kvs.filter((k) => msinfoSummaryPathMatches(k.path) && /^Тип$/i.test((k.item || "").trim()));
    if (!cand.length) return "";
    const vOf = (/** @type {{ value?: string }} */ k) => String(k.value || "").trim();
    const looksLikePcKind = (t) =>
      /компьютер|на базе|x64|x86|it-based|архитектур|рабоч|мобильн|ноутбук|планшет|встраиваем|встроенн|desktop|laptop|tablet|workstation|\bpc\b|based\s+pc/i.test(
        t
      );
    const looksLikeDriverKind = (t) =>
      /драйвер|driver|kernel|ядер|ядра|ядро|kbd|filter|устройств|controller/i.test(t);
    const best = [...cand].sort((a, b) => {
      const va = vOf(a);
      const vb = vOf(b);
      const sa = looksLikePcKind(va) ? 2 : looksLikeDriverKind(va) ? 0 : 1;
      const sb = looksLikePcKind(vb) ? 2 : looksLikeDriverKind(vb) ? 0 : 1;
      return sb - sa;
    })[0];
    const pick = vOf(best);
    if (pick && looksLikeDriverKind(pick) && !looksLikePcKind(pick)) return "";
    return pick;
  }

  /**
   * @param {{ path: string, fields: Record<string, string> }[]} rows
   */
  function pickSystemTypeFromBareTypRows(rows) {
    /** @type {string[]} */
    const vals = [];
    for (const r of rows) {
      if (!msinfoSummaryPathMatches(r.path)) continue;
      for (const [k, v] of Object.entries(r.fields)) {
        if (!/^Тип$/i.test(k.trim())) continue;
        const t = String(v || "").trim();
        if (t) vals.push(t);
      }
    }
    if (!vals.length) return "";
    const looksLikePcKind = (t) =>
      /компьютер|на базе|x64|x86|it-based|архитектур|рабоч|мобильн|ноутбук|планшет|встраиваем|встроенн|desktop|laptop|tablet|workstation|\bpc\b|based\s+pc/i.test(
        t
      );
    const looksLikeDriverKind = (t) =>
      /драйвер|driver|kernel|ядер|ядра|ядро|kbd|filter|устройств|controller/i.test(t);
    const pick =
      [...vals].sort((a, b) => {
        const sa = looksLikePcKind(a) ? 2 : looksLikeDriverKind(a) ? 0 : 1;
        const sb = looksLikePcKind(b) ? 2 : looksLikeDriverKind(b) ? 0 : 1;
        return sb - sa;
      })[0] || vals[0];
    if (pick && looksLikeDriverKind(pick) && !looksLikePcKind(pick)) return "";
    return pick;
  }

  /**
   * @param {RegExp | RegExp[]} itemRes
   * @param {{ path: string, item: string, value: string }[]} kvs
   */
  function kvValI18n(itemRes, kvs) {
    for (const re of MSINFO_I18N.itemPatterns(itemRes)) {
      const x = kvs.find((k) => re.test((k.item || "").trim()));
      const v = (x?.value || "").trim();
      if (v) return v;
    }
    return "";
  }

  /**
   * True when a value looks like MSInfo’s “processor driver” / IRQ row, not the CPU model line.
   * @param {string} v
   */
  function valueLooksLikeMsInfoProcessorDriverBlob(v) {
    const x = String(v || "");
    if (!x) return false;
    if (/\\windows\\system32\\drivers\\/i.test(x) && /\.sys\b/i.test(x)) return true;
    if (/\\systemroot\\system32\\drivers\\/i.test(x) && /\.sys\b/i.test(x)) return true;
    if (/ドライバー.*\.sys|\.sys.*ドライバー/i.test(x) && /カーネル|kernel/i.test(x)) return true;
    return false;
  }

  /**
   * Prefer the System Summary “Processor” row; never use {@link kvValI18n} here (it matches the first
   * “Processor”/Cyrillic label anywhere in the file — often a driver row in Japanese text exports).
   * @param {{ path: string, item: string, value: string }[]} kvs
   */
  function pickProcessorSummaryFromKvs(kvs) {
    const rows = kvs.filter((k) => msinfoSummaryPathMatches(k.path));
    const itemMatchers = [
      /^Processor$/i,
      /^Processeur$/i,
      /^Prozessor$/i,
      /^Procesador$/i,
      /^Processador$/i,
      /^Процессор$/i,
      /^处理器$/,
      /^プロセッサ$/,
      /^プロセッサー$/,
    ];
    const badItem = (/** @type {string} */ it) => /ドライバー|driver$/i.test(String(it || "").trim());
    /** @type {{ v: string, score: number }[]} */
    const candidates = [];
    for (const k of rows) {
      const it = String(k.item || "").trim();
      if (!it || badItem(it)) continue;
      if (!itemMatchers.some((re) => re.test(it))) continue;
      const v = String(k.value || "").trim();
      if (!v || valueLooksLikeMsInfoProcessorDriverBlob(v)) continue;
      let score = 2;
      if (/^プロセッサ$/.test(it)) score += 8;
      if (/^(Processor|Процессор)$/i.test(it)) score += 5;
      if (
        /intel|amd|apple|qualcomm|snapdragon|core|ryzen|xeon|threadripper|インテル|エイジーエス|\.ghz|ghz|mhz|@|ファミリ/i.test(
          v
        )
      )
        score += 14;
      candidates.push({ v, score });
    }
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0]?.v || "";
  }

  /**
   * @param {{ kvs: { path: string, item: string, value: string }[], rows: { path: string, fields: Record<string, string> }[] }} data
   */
  function extractSystemSummary(data) {
    const { kvs, rows } = data;

    const boardPathRe = /Motherboard|Base\s*Board|BaseBoard|System Board|Mainboard|Main Board/i;
    let boardKvs = kvs.filter((k) => boardPathRe.test(k.path));
    if (!boardKvs.length) {
      boardKvs = kvs.filter((k) => /^(BaseBoard|Base Board)\s+/i.test((k.item || "").trim()));
    }
    const pickBoard = (label) => {
      const lab = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(
        `^(BaseBoard|Base\\s*Board)\\s+${lab}$|^${lab}$`,
        "i"
      );
      const x = boardKvs.find((k) => re.test((k.item || "").trim()));
      return x?.value || "";
    };
    const pickBoardFromRows = (label) => {
      const lab = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(
        `^(BaseBoard|Base\\s*Board)\\s+${lab}$|^${lab}$`,
        "i"
      );
      for (const r of rows) {
        if (!boardPathRe.test(r.path)) continue;
        for (const [k, v] of Object.entries(r.fields)) {
          if (re.test(k.trim()) && v && String(v).trim()) return String(v).trim();
        }
      }
      return "";
    };
    const pickBoardML = (/** @type {string[]} */ labels) => {
      for (const lab of labels) {
        const v = pickBoard(lab) || pickBoardFromRows(lab);
        if (v) return v;
      }
      return "";
    };
    let motherboard = {
      manufacturer: pickBoardML(["Manufacturer", "Hersteller", "Fabricant", "Fabricante", "Производитель", "制造商"]),
      product: pickBoardML([
        "Product",
        "Model",
        "Product Name",
        "Produkt",
        "Modell",
        "Modèle",
        "Modelo",
        "Nombre de producto",
        "Продукт",
        "型号",
      ]),
      version: pickBoardML([
        "Version",
        "Serial Number",
        "Seriennummer",
        "Numéro de série",
        "Número de serie",
        "Версия",
        "版本",
      ]),
    };
    if (!motherboard.manufacturer && !motherboard.product) {
      const anyBoard = (/** @param {RegExp} itemRe */ itemRe) =>
        kvs.find((k) => itemRe.test((k.item || "").trim()));
      const m =
        anyBoard(/^BaseBoard Manufacturer$/i) ||
        anyBoard(/^Mainboardhersteller$/i);
      const p =
        anyBoard(/^BaseBoard Product$/i) ||
        anyBoard(/^BaseBoard Model$/i) ||
        anyBoard(/^Base Board Product$/i) ||
        anyBoard(/^Mainboardprodukt$/i) ||
        anyBoard(/^Mainboardmodell$/i);
      const v =
        anyBoard(/^BaseBoard Version$/i) ||
        anyBoard(/^BaseBoard Serial Number$/i) ||
        anyBoard(/^Base Board Serial Number$/i) ||
        anyBoard(/^Mainboardversion$/i) ||
        anyBoard(/^Mainboardseriennummer$/i);
      motherboard = {
        manufacturer: m?.value?.trim() || "",
        product: p?.value?.trim() || "",
        version: v?.value?.trim() || "",
      };
    }
    if (!motherboard.manufacturer && !motherboard.product) {
      for (const r of rows) {
        const f = r.fields;
        const man =
          f["BaseBoard Manufacturer"] ||
          f["Base Board Manufacturer"] ||
          f["Изготовитель основной платы"] ||
          f.Hersteller;
        const prod =
          f["BaseBoard Product"] ||
          f["Base Board Product"] ||
          f["BaseBoard Model"] ||
          f["Модель основной платы"] ||
          f.Produkt ||
          f.Modell ||
          f.Modèle;
        const ver =
          f["BaseBoard Version"] ||
          f["BaseBoard Serial Number"] ||
          f["Версия основной платы"] ||
          f.Seriennummer;
        if (man || prod || ver) {
          motherboard = {
            manufacturer: String(man || "").trim() || motherboard.manufacturer,
            product: String(prod || "").trim() || motherboard.product,
            version: String(ver || "").trim() || motherboard.version,
          };
          break;
        }
      }
    }

    if (!motherboard.manufacturer && !motherboard.product) {
      const pickSmKv = (/** @param {RegExp} itemRe */ itemRe) => {
        const x = kvs.find((k) => msinfoSummaryPathMatches(k.path) && itemRe.test((k.item || "").trim()));
        return (x?.value || "").trim();
      };
      const mfr = pickSmKv(/^Изготовитель основной платы$/i);
      const prod = pickSmKv(/^Модель основной платы$/i);
      const ver = pickSmKv(/^Версия основной платы$/i);
      if (mfr || prod || ver) {
        motherboard = {
          manufacturer: mfr || motherboard.manufacturer,
          product: prod || motherboard.product,
          version: ver || motherboard.version,
        };
      }
    }

    const formHints = [];
    const pushItem = (re) => {
      const x = kvs.find((k) => re.test(k.item));
      if (x) formHints.push(x.value);
    };
    pushItem(/^System Family$/i);
    pushItem(/Chassis Type/i);
    pushItem(/^Тип корпуса$/i);
    pushItem(/^Gehäusetyp$/i);
    pushItem(/^Type de châssis$/i);
    pushItem(/PC System Type/i);
    pushItem(/^PC-Systemtyp$/i);
    pushItem(/^Platform Role$/i);
    pushItem(/^Роль платформы$/i);
    pushItem(/^Systemrolle$/i);
    pushItem(/^System SKU$/i);
    pushItem(/^Тип системы$/i);
    pushItem(/^Systemtyp$/i);
    for (const r of rows) {
      const f = r.fields;
      const blob = [
        f.Type,
        f["Тип"],
        f.Chassis,
        f["Тип корпуса"],
        f["Enclosure Type"],
        f["System Type"],
        f["Роль платформы"],
        f.Description,
      ]
        .filter(Boolean)
        .join(" ");
      if (blob) formHints.push(blob);
    }

    const osName =
      kvFromSummaryI18n(
        [
          /^OS Name$/i,
          /^Betriebssystemname$/i,
          /^Nom du système d'exploitation$/i,
          /^Nombre del sistema operativo$/i,
          /^Nome do SO$/i,
          /^Nome do sistema operacional$/i,
          /^Nom du système$/i,
          /^Название ОС$/i,
          /^Имя ОС$/i,
          /^操作系统名称$/i,
          /^OS\s*名$/,
          /^OS名$/,
        ],
        kvs
      ) ||
      kvValI18n(
        [/^OS Name$/i, /^Betriebssystemname$/i, /^Имя ОС$/i, /^Название ОС$/i, /^OS\s*名$/, /^OS名$/],
        kvs
      ) ||
      fieldFromRowsI18n(
        [
          /^OS Name$/i,
          /^Betriebssystemname$/i,
          /^Nom du système d'exploitation$/i,
          /^Nombre del sistema operativo$/i,
          /^Название ОС$/i,
          /^Имя ОС$/i,
          /^OS\s*名$/,
          /^OS名$/,
        ],
        rows
      );
    let osVersionLine =
      kvFromSummaryI18n(
        [
          /^Version$/i,
          /^Betriebssystemversion$/i,
          /^Version du système$/i,
          /^Version du système d'exploitation$/i,
          /^Versión del sistema operativo$/i,
          /^Versão do sistema operacional$/i,
          /^Версия ОС$/i,
          /^Версия$/i,
          /^バージョン$/,
          /^OS\s*バージョン$/,
        ],
        kvs
      ) ||
      kvValI18n(
        [
          /^OS Version$/i,
          /^Betriebssystemversion$/i,
          /^Version du système d'exploitation$/i,
          /^Версия$/i,
          /^Версия ОС$/i,
          /^バージョン$/,
          /^OS\s*バージョン$/,
        ],
        kvs
      ) ||
      fieldFromRowsI18n(
        [/^OS Version$/i, /^Betriebssystemversion$/i, /^Версия$/i, /^Версия ОС$/i, /^バージョン$/, /^OS\s*バージョン$/],
        rows
      );
    if (!osVersionLine) {
      const verKv = kvs.find((k) => {
        const it = (k.item || "").trim();
        const versionish =
          /^Version$/i.test(it) ||
          /^Betriebssystemversion$/i.test(it) ||
          /^OS Version$/i.test(it) ||
          /^Versión$/i.test(it);
        return (
          versionish &&
          /\b(10|11)\.0\.\d+|Microsoft Windows|Майкрософт Windows|Windows \d+|\bСборка\s*\d+/i.test(k.value || "")
        );
      });
      osVersionLine = (verKv?.value || "").trim();
    }
    if (!osVersionLine) {
      osVersionLine =
        kvValI18n([/^Version$/i, /^Betriebssystemversion$/i, /^Версия$/i], kvs) ||
        fieldFromRowsI18n([/^Version$/i, /^Betriebssystemversion$/i, /^Версия$/i], rows);
    }
    const osBuild = extractWindowsBuildFromVersionLine(osVersionLine);

    const systemTypeRaw =
      kvFromSummaryI18n(
        [
          /^System Type$/i,
          /^Systemtyp$/i,
          /^Type du système$/i,
          /^Tipo de sistema$/i,
          /^Tipo de Sistema$/i,
          /^Тип системы$/i,
          /^Тип компьютера$/i,
          /^Тип ПК$/i,
          /^Вид системы$/i,
          /^系统类型$/i,
          /^システムの種類$/,
          /^システム\s*タイプ$/,
        ],
        kvs
      ) ||
      pickSystemTypeFromBareTypKvs(kvs) ||
      kvValI18n(
        [
          /^System Type$/i,
          /^Systemtyp$/i,
          /^Tipo de sistema$/i,
          /^Тип системы$/i,
          /^Тип компьютера$/i,
          /^Тип ПК$/i,
          /^Вид системы$/i,
        ],
        kvs
      ) ||
      fieldFromRowsSummaryPathOnly(
        [
          /^System Type$/i,
          /^Systemtyp$/i,
          /^Type du système$/i,
          /^Tipo de sistema$/i,
          /^Тип системы$/i,
          /^Тип компьютера$/i,
          /^Тип ПК$/i,
          /^Вид системы$/i,
          /^系统类型$/i,
        ],
        rows
      ) ||
      pickSystemTypeFromBareTypRows(rows) ||
      fieldFromRowsI18n(
        [
          /^System Type$/i,
          /^Systemtyp$/i,
          /^Type du système$/i,
          /^Tipo de sistema$/i,
          /^Тип системы$/i,
          /^Тип компьютера$/i,
          /^Тип ПК$/i,
          /^Вид системы$/i,
          /^系统类型$/i,
        ],
        rows
      );
    const processor =
      pickProcessorSummaryFromKvs(kvs) ||
      kvFromSummaryI18n(
        [
          /^Processor$/i,
          /^Processeur$/i,
          /^Prozessor$/i,
          /^Procesador$/i,
          /^Processador$/i,
          /^Процессор$/i,
          /^处理器$/i,
          /^プロセッサ$/,
          /^プロセッサー$/,
        ],
        kvs
      ) ||
      fieldFromRowsSummaryPathOnly(
        [
          /^Processor$/i,
          /^Processeur$/i,
          /^Prozessor$/i,
          /^Процессор$/i,
          /^プロセッサ$/,
          /^プロセッサー$/,
        ],
        rows
      ) ||
      fieldFromRowsI18n(
        [
          /^Processor$/i,
          /^Processeur$/i,
          /^Prozessor$/i,
          /^Процессор$/i,
          /^プロセッサ$/,
          /^プロセッサー$/,
        ],
        rows
      );
    const timeZone =
      kvFromSummaryI18n(
        [
          /^Time Zone$/i,
          /^Zeitzone$/i,
          /^Fuseau horaire$/i,
          /^Zona horaria$/i,
          /^Fuso horário$/i,
          /^Часовой пояс$/i,
          /^时区$/i,
          /^タイム\s*ゾーン$/,
          /^タイムゾーン$/,
          /^時刻帯$/,
        ],
        kvs
      ) ||
      kvValI18n(
        [/^Time Zone$/i, /^Zeitzone$/i, /^Fuseau horaire$/i, /^Часовой пояс$/i, /^タイム\s*ゾーン$/, /^タイムゾーン$/, /^時刻帯$/],
        kvs
      ) ||
      fieldFromRowsSummaryPathOnly(
        [/^Time Zone$/i, /^Zeitzone$/i, /^Fuseau horaire$/i, /^Часовой пояс$/i, /^タイム\s*ゾーン$/, /^タイムゾーン$/, /^時刻帯$/],
        rows
      ) ||
      fieldFromRowsI18n(
        [/^Time Zone$/i, /^Zeitzone$/i, /^Fuseau horaire$/i, /^Часовой пояс$/i, /^タイム\s*ゾーン$/, /^タイムゾーン$/, /^時刻帯$/],
        rows
      );
    const osInstallDate =
      kvFromSummaryI18n(
        [
          /Original Install Date/i,
          /Install Date/i,
          /Ursprüngliches Installationsdatum/i,
          /^Installationsdatum$/i,
          /Date d'installation d'origine/i,
          /Date d'installation originale/i,
          /Data de instalação original/i,
          /Data da instalação original/i,
          /Дата установки/i,
          /原始安装日期/i,
        ],
        kvs
      ) ||
      kvValI18n(
        [
          /Original Install Date/i,
          /^Install Date$/i,
          /Ursprüngliches Installationsdatum/i,
          /^Installationsdatum$/i,
          /Date d'installation/i,
        ],
        kvs
      ) ||
      fieldFromRowsI18n(
        [/Original Install Date/i, /Ursprüngliches Installationsdatum/i, /Date d'installation d'origine/i],
        rows
      );

    let platformRole =
      kvFromSummaryI18n(
        [
          /^Platform Role$/i,
          /^Systemrolle$/i,
          /^Plattformrolle$/i,
          /^Rôle de la plateforme$/i,
          /^Rol de la plataforma$/i,
          /^Função da plataforma$/i,
          /^Роль платформы$/i,
          /^プラットフォームの役割$/,
          /^プラットフォーム\s*ロール$/,
        ],
        kvs
      ) ||
      kvValI18n(
        [
          /^Platform Role$/i,
          /^Systemrolle$/i,
          /^Plattformrolle$/i,
          /^Rôle de la plateforme$/i,
          /^Rol de la plataforma$/i,
          /^Função da plataforma$/i,
          /^Роль платформы$/i,
          /^プラットフォームの役割$/,
          /^プラットフォーム\s*ロール$/,
        ],
        kvs
      ) ||
      fieldFromRowsSummaryPathOnly(
        [
          /^Platform Role$/i,
          /^Systemrolle$/i,
          /^Rôle de la plateforme$/i,
          /^Роль платформы$/i,
          /^プラットフォームの役割$/,
          /^プラットフォーム\s*ロール$/,
        ],
        rows
      ) ||
      fieldFromRowsI18n(
        [
          /^Platform Role$/i,
          /^Systemrolle$/i,
          /^Rôle de la plateforme$/i,
          /^Роль платформы$/i,
          /^プラットフォームの役割$/,
          /^プラットフォーム\s*ロール$/,
        ],
        rows
      );
    let pcSystemType =
      kvValI18n(
        [
          /^PC System Type$/i,
          /^PC-Systemtyp$/i,
          /^Type de PC$/i,
          /^Tipo de PC$/i,
          /^Тип ПК$/i,
        ],
        kvs
      ) || fieldFromRowsI18n([/^PC System Type$/i, /^PC-Systemtyp$/i, /^Type de PC$/i], rows);
    let chassisType =
      kvValI18n(
        [
          /Chassis Type/i,
          /^Gehäusetyp$/i,
          /^Type de châssis$/i,
          /^Tipo de chasis$/i,
          /^Тип корпуса$/i,
          /^机箱类型$/i,
        ],
        kvs
      ) ||
      fieldFromRowsI18n([/^Chassis Type$/i, /^Gehäusetyp$/i, /^Type de châssis$/i, /^Тип корпуса$/i], rows);

    let systemForm = "";
    const pr = platformRole.toLowerCase();
    if (
      /\bdesktop\b|workstation|appliance\s+pc|рабочий\s+стол|настольн|рабочая\s+станция/i.test(pr) &&
      !/\bmobile\b|\bslate\b|мобильн|планшет|ноутбук/i.test(pr)
    ) {
      systemForm = "Desktop / workstation-class";
    } else if (/\bmobile\b|slate|handheld|phone|мобильн|планшет|ноутбук|переносн/i.test(pr)) {
      systemForm = "Laptop / mobile-class";
    } else if (
      pcSystemType &&
      /\bdesktop\b|рабочий\s+стол|настольн/i.test(pcSystemType) &&
      !/\bmobile\b|laptop|ноутбук|планшет/i.test(pcSystemType)
    ) {
      systemForm = "Desktop / workstation-class";
    } else if (
      pcSystemType &&
      /\bmobile\b|laptop|notebook|tablet|ноутбук|планшет|переносн/i.test(pcSystemType)
    ) {
      systemForm = "Laptop / mobile-class";
    } else if (chassisType && /\b(desktop|tower|mini|pizza|low profile|convertible|all in one|mainstream)\b/i.test(chassisType)) {
      if (/all\s*in\s*one|convertible/i.test(chassisType)) {
        systemForm = /convertible/i.test(chassisType)
          ? "Laptop / mobile-class (2-in-1 / convertible chassis)"
          : "All-in-one (desktop with integrated display)";
      } else {
        systemForm = "Desktop / workstation-class";
      }
    } else if (
      chassisType &&
      /\b(notebook|laptop|portable|handheld|tablet|ноутбук|планшет|переносн)\b/i.test(chassisType)
    ) {
      systemForm = "Laptop / mobile-class";
    } else {
      let blob = formHints.join(" ").toLowerCase();
      blob = blob
        .replace(/\blaptop\s*gpu\b/gi, " ")
        .replace(/\bmobile\s*gpu\b/gi, " ")
        .replace(/\bnotebook\s*gpu\b/gi, " ");
      if (/laptop|notebook|portable|convertible|tablet|slate|book(?! drive)/i.test(blob)) {
        systemForm = "Laptop / mobile-class";
      } else if (/all-in-one|\baio\b/i.test(blob)) {
        systemForm = "All-in-one (desktop with integrated display)";
      } else if (/desktop|tower|mini pc|workstation|small form|sff|docking|docked/i.test(blob)) {
        systemForm = "Desktop / workstation-class";
      } else if (blob.trim()) {
        systemForm = `See hints: ${formHints[0]}`;
      } else {
        systemForm = "Not clearly stated in this export";
      }
    }

    let biosVersion = "";
    let biosDate = "";
    const biosKv = kvs.find((k) => {
      const it = (k.item || "").trim();
      return (
        /^BIOS Version\/Date$/i.test(it) ||
        /^BIOS-Version\/Datum$/i.test(it) ||
        /^BIOS-Version\s*\/\s*Datum$/i.test(it) ||
        /^Version du BIOS\/Date$/i.test(it) ||
        /^Version du BIOS\s*\/\s*Date$/i.test(it) ||
        /^Versión de BIOS \/ fecha$/i.test(it) ||
        /^Versão do BIOS \/ data$/i.test(it) ||
        /^Версия BIOS\/дата$/i.test(it) ||
        /^Версия\s+BIOS\s*\/\s*дата$/i.test(it) ||
        /^Версия\s*BIOS$/i.test(it) ||
        /^BIOS版本\/日期$/i.test(it)
      );
    });
    if (biosKv) {
      const parts = biosKv.value.split(",").map((x) => x.trim());
      biosVersion = parts[0] || biosKv.value;
      biosDate = parts.slice(1).join(", ") || "";
    } else {
      const v = kvs.find(
        (k) =>
          (/BIOS Version$/i.test((k.item || "").trim()) ||
            /^BIOS-Version$/i.test((k.item || "").trim()) ||
            /^Version du BIOS$/i.test((k.item || "").trim()) ||
            /^Версия\s*BIOS$/i.test((k.item || "").trim())) &&
          !/date|datum|fecha|дата|日期/i.test((k.item || "").trim())
      );
      const d = kvs.find((k) =>
        /BIOS.*Date|Release Date|BIOS-Datum|Datum du BIOS|fecha del BIOS|Data do BIOS|дата BIOS/i.test(
          (k.item || "").trim()
        )
      );
      biosVersion = v?.value || "";
      biosDate = d?.value || "";
      const pathBios = kvs.filter(
        (k) =>
          /\/BIOS$/i.test(k.path) ||
          /Components.*BIOS/i.test(k.path) ||
          /Компоненты.*BIOS/i.test(k.path)
      );
      if (!biosVersion) {
        const ver = pathBios.find((k) => /^Version$/i.test(k.item) || /^Версия$/i.test((k.item || "").trim()));
        if (ver) biosVersion = ver.value;
      }
      if (!biosDate) {
        const rd = pathBios.find((k) => /Date|Дата/i.test(k.item || ""));
        if (rd) biosDate = rd.value;
      }
    }

    const biosDateObj = tryParseBiosDate(biosVersion, biosDate);
    const biosAgeDays =
      biosDateObj != null ? Math.floor((Date.now() - biosDateObj.getTime()) / 86400000) : null;

    const graphics = extractDisplayGpuSummary(kvs, rows);
    if (!Array.isArray(graphics.adapters)) graphics.adapters = [];

    const hasNvidiaInAdapters = () =>
      graphics.adapters.some((a) => a && a.vendorLabel === "NVIDIA");

    if (!hasNvidiaInAdapters()) {
      const nk = kvs.find(
        (k) =>
          isDisplayNameItem(k.item) &&
          (/NVIDIA|GeForce|RTX|Quadro|Tesla/i.test(k.value) || /\bVEN_10DE\b/i.test(k.value))
      );
      if (nk) {
        let drv = pickNvidiaDisplayDriverKvs(kvs) || pickNvidiaDriverFromRows(rows);
        if (!drv) {
          const drvKv = kvs.find((x) => x.path === nk.path && isDriverVersionItem(x.item));
          const d = drvKv?.value?.trim() || "";
          if (d && !isIntelDriverVersionString(d)) drv = d;
        }
        if (nk.value || drv) {
          const byPathNv = new Map();
          for (const k of kvs) {
            if (!isMsInfoDisplayRelatedPath(k.path)) continue;
            if (k.path !== nk.path) continue;
            if (!byPathNv.has(k.path)) byPathNv.set(k.path, {});
            byPathNv.get(k.path)[k.item] = k.value;
          }
          const nvFields = mergePathFields(nk.path, byPathNv, rows);
          const nm = {
            driverVersion: displayFieldByLabels(nvFields, [
              "Driver Version",
              "Версия драйвера",
              "ドライバーのバージョン",
              "ドライバのバージョン",
              "ドライバー バージョン",
              "ドライバ バージョン",
            ]),
            driverDate: displayFieldByLabels(nvFields, [
              "Driver Date",
              "Дата драйвера",
              "ドライバーの日付",
              "ドライバの日付",
              "ドライバー 日付",
              "バージョンの日付",
              "ドライバー バージョンの日付",
              "ドライバのバージョンの日付",
            ]),
            pnp: displayFieldByLabels(nvFields, [
              "PNP Device ID",
              "PNP_Device_ID",
              "ID PNP-устройства",
              "ИД PNP-устройства",
              "PNP デバイス ID",
              "PNPデバイス ID",
              "Plug and Play デバイス ID",
            ]),
            adapterType: displayFieldByLabels(nvFields, [
              "Adapter Type",
              "Тип адаптера",
              "Описание адаптера",
              "アダプターの種類",
              "アダプター種類",
              "アダプタの種類",
              "アダプター タイプ",
              "製品の種類",
              "チップの種類",
              "チップ タイプ",
            ]),
            adapterRam: displayFieldByLabels(nvFields, [
              "Adapter RAM",
              "ОЗУ адаптера",
              "Память адаптера",
              "アダプター RAM",
              "アダプタ RAM",
              "アダプターの RAM",
            ]),
          };
          const devIdN = pnpToDeviceId(nm.pnp);
          const drvFmt = drv && isNvidiaDriverVersionString(drv) ? nvidiaInternalToDisplayVersion(drv) : "";
          const verDisp = drvFmt || nm.driverVersion || drv || "";
          const nv = {
            name: nk.value,
            resolution: "",
            driverFull: drv,
            driverFormatted: drvFmt,
            drivesDisplay: false,
            vendorLabel: "NVIDIA",
            driverVersionDisplay: verDisp,
            driverDate: nm.driverDate || "",
            deviceId: devIdN,
            pciLookupUrl: pciLookupUrlFromDeviceId(devIdN),
            adapterType: nm.adapterType || "",
            adapterRam: nm.adapterRam || "",
          };
          graphics.adapters.push(nv);
          graphics.nvidia = nv;
        }
      }
    }

    for (const a of graphics.adapters) {
      if (
        a &&
        a.vendorLabel === "NVIDIA" &&
        a.driverFull &&
        isIntelDriverVersionString(a.driverFull)
      ) {
        const drv = pickNvidiaDisplayDriverKvs(kvs) || pickNvidiaDriverFromRows(rows);
        if (drv) {
          a.driverFull = drv;
          const df = isNvidiaDriverVersionString(drv) ? nvidiaInternalToDisplayVersion(drv) : "";
          a.driverFormatted = df;
          a.driverVersionDisplay = df || drv;
        }
      }
    }

    if (graphics.adapters.length) {
      graphics.intel = graphics.adapters.find((a) => a && a.vendorLabel === "INTEL") || null;
      graphics.nvidia = graphics.adapters.find((a) => a && a.vendorLabel === "NVIDIA") || graphics.nvidia;
    }

    /** @type { { device: string, vendor: string, detail: string }[] } */
    const problems = [];
    /** MSInfo “Problem Devices” lives under Components; Russian builds often use «Устройства с неполадками». */
    const problemPathRe =
      /Problem Devices|Problemtreiber|Probleemapparaten|Dispositivos con problemas|Dispositivos com problemas|Проблемные устройства|Устройства с проблемами|Устройства с неполадками|Устройства с ошибками|Неисправные устройства|appareils problématiques|appareils avec des problèmes|dispositivi con problemi|probleem apparaten|problemhardware|设备有问题|問題のあるデバイス|不具合のあるデバイス|故障したデバイス|問題デバイス|問題のデバイス/i;
    const pathLooksLikeProblemDevices = (/** @type {string} */ p) => {
      const s = String(p || "");
      if (problemPathRe.test(s)) return true;
      if (/неполадк/i.test(s) && /устройств/i.test(s) && /\s[сС]\s/i.test(s)) return true;
      if (/問題|不具合|故障/.test(s) && /デバイス|装置/.test(s)) return true;
      return false;
    };
    /** Normalize MSInfo row/item labels (spaces, underscores, NBSP, BOM) for column matching. */
    const problemFieldKeyCompact = (/** @type {string} */ s) =>
      String(s || "")
        .replace(/^\ufeff/, "")
        .replace(/\u00a0/g, " ")
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, "");
    /** @param {Record<string, string>} f */
    const rowValueByCompactKeys = (f, /** @type {string[]} */ wantedCompacts) => {
      const want = new Set(wantedCompacts);
      for (const [k, v] of Object.entries(f)) {
        if (v == null || !String(v).trim()) continue;
        if (want.has(problemFieldKeyCompact(k))) return String(v).trim();
      }
      return "";
    };
    for (const r of rows) {
      if (!pathLooksLikeProblemDevices(r.path)) continue;
      const f = r.fields;
      const device =
        f.Device ||
        f.Name ||
        f.Item ||
        f.Description ||
        f.Gerät ||
        f.Dispositivo ||
        f.Устройство ||
        f.デバイス ||
        f["デバイス名"] ||
        rowValueByCompactKeys(f, [
          "device",
          "name",
          "item",
          "description",
          "устройство",
          "название",
          "デバイス名",
          "デバイス",
        ]) ||
        "";
      const vendor =
        f["PNP Device ID"] ||
        f["PNP_Device_ID"] ||
        f["Код_устройства_PNP"] ||
        f["Код устройства PNP"] ||
        f["PNP デバイス ID"] ||
        f["PNPデバイス ID"] ||
        rowValueByCompactKeys(f, ["pnpdeviceid", "кодустройстваpnp", "pnpデバイスid", "plugandplayデバイスid"]) ||
        f.Vendor ||
        f.Manufacturer ||
        f.Provider ||
        f.Hersteller ||
        f.Fabricant ||
        f.Fabricante ||
        f.Fournisseur ||
        f.Производитель ||
        "";
      const detail =
        f.Problem ||
        f["Problem Code"] ||
        f["Код_ошибки"] ||
        f["Код ошибки"] ||
        f["問題"] ||
        f["問題のコード"] ||
        f["問題コード"] ||
        f["エラー コード"] ||
        rowValueByCompactKeys(f, [
          "problem",
          "problemcode",
          "кодошибки",
          "error",
          "status",
          "fehler",
          "問題",
          "問題のコード",
          "問題コード",
          "エラーコード",
        ]) ||
        f.Error ||
        f.Status ||
        f["Code de problème"] ||
        f["Código de problema"] ||
        f.Fehler ||
        "";
      if (device || vendor || detail) problems.push({ device, vendor, detail });
    }
    if (!problems.length) {
      /** @type {{ device: string, vendor: string, detail: string } | null} */
      let cur = null;
      const flush = () => {
        if (cur && (cur.device || cur.vendor || cur.detail)) problems.push(cur);
        cur = null;
      };
      const isDeviceItem = (/** @type {string} */ it) => {
        const c = problemFieldKeyCompact(it);
        return (
          c === "device" ||
          c === "name" ||
          c === "item" ||
          c === "gerät" ||
          c === "dispositivo" ||
          c === "dispositif" ||
          c === "apparaat" ||
          c === "устройство" ||
          c === "название" ||
          c === "デバイス名" ||
          c === "デバイス"
        );
      };
      const isPnpItem = (/** @type {string} */ it) => {
        const c = problemFieldKeyCompact(it);
        return (
          c === "pnpdeviceid" ||
          c === "pnp_device_id" ||
          c === "кодустройстваpnp" ||
          c === "pnpデバイスid" ||
          c === "plugandplayデバイスid"
        );
      };
      const isErrorDetailItem = (/** @type {string} */ it) => {
        const c = problemFieldKeyCompact(it);
        return (
          c === "problem" ||
          c === "problemcode" ||
          c === "кодошибки" ||
          c === "error" ||
          c === "status" ||
          c === "fehler" ||
          /^кодошиб/.test(c) ||
          c === "問題" ||
          c === "問題のコード" ||
          c === "問題コード" ||
          c === "エラーコード" ||
          /^問題/.test(c) ||
          /^エラー/.test(c)
        );
      };
      for (const k of kvs) {
        if (!pathLooksLikeProblemDevices(k.path)) continue;
        const it = String(k.item || "")
          .replace(/^\ufeff/, "")
          .trim();
        const val = (k.value || "").trim();
        if (isDeviceItem(it)) {
          flush();
          cur = { device: val, vendor: "", detail: "" };
          continue;
        }
        if (!cur) cur = { device: "", vendor: "", detail: "" };
        if (isPnpItem(it)) {
          cur.vendor = val;
          continue;
        }
        if (isErrorDetailItem(it)) {
          cur.detail = val;
          continue;
        }
      }
      flush();
    }

    const networkAdapters = summarizeNetworkAdapters(kvs, rows);

    /** @param {RegExp | RegExp[]} labelRe */
    const pickSummaryMemory = (labelRe) => pickSummaryMemoryI18n(labelRe, kvs, rows);

    /** MSInfo often labels the path as "Page File" (not "Page File Location(s)"). */
    const looksLikePageFilePath = (/** @type {string} */ raw) => {
      const s = String(raw || "").trim();
      if (!s) return false;
      if (/^[\u2014\u2013\-–—?]+$/i.test(s)) return false;
      if (/^(none|disabled)$/i.test(s)) return true;
      if (/^\d[\d,.\s]*(bytes|kb|mb|gb|tb)\b/i.test(s) && !/[\\/]/.test(s)) return false;
      return /[\\/]/.test(s) || /\.sys$/i.test(s) || /^[a-z]:$/i.test(s);
    };

    const pickPageFileLocation = () => {
      let v =
        pickSummaryMemory([
          /Page File Location\(s\)?/i,
          /Paging File Location/i,
          /Paging Files?:\s*Location/i,
          /Auslagerungsdateiort/i,
          /Speicherort der Auslagerungsdatei/i,
          /Emplacement du fichier d'échange/i,
          /Ubicación del archivo de paginación/i,
          /Localização do arquivo de paginação/i,
          /Расположение файла подкачки/i,
          /Файл подкачки/i,
          /分页文件位置/i,
          /ページ\s*ファイルの場所/i,
          /ページング\s*ファイルの場所/i,
          /ページ\s*ファイル\s*の\s*場所/i,
        ]) || "";
      if (v) return v;
      for (const k of kvs) {
        const it = (k.item || "").trim();
        if (
          /page file location|auslagerungsdateiort|speicherort der auslagerungsdatei|emplacement du fichier|ubicación del archivo|localização do arquivo|расположение файла подкачки|^файл подкачки$|分页文件位置|ページ\s*ファイル.*場所|ページング\s*ファイル.*場所/i.test(
            it
          ) &&
          k.value.trim()
        ) {
          return k.value.trim();
        }
      }
      for (const k of kvs) {
        const it = (k.item || "").trim();
        if (
          (/^page file$/i.test(it) ||
            /^auslagerungsdatei$/i.test(it) ||
            /^fichier d'échange$/i.test(it) ||
            /^archivo de paginación$/i.test(it) ||
            /^arquivo de paginação$/i.test(it) ||
            /^файл подкачки$/i.test(it) ||
            /^ページ\s*ファイル$/i.test(it) ||
            /^ページング\s*ファイル$/i.test(it)) &&
          looksLikePageFilePath(k.value)
        ) {
          return k.value.trim();
        }
      }
      for (const r of rows) {
        if (
          !MSINFO_I18N.memoryRowPath.test(r.path) &&
          !/(^|\/)Paging(\/|$)|Auslagerung|paginación|paginação|分页|подкачк|ページ|メモリ/i.test(r.path)
        ) {
          continue;
        }
        for (const [key, val] of Object.entries(r.fields)) {
          const kt = key.trim();
          if (
            /page file location|auslagerungsdateiort|speicherort der auslagerungsdatei|emplacement du fichier|ubicación del archivo|расположение файла подкачки|^файл подкачки$|分页文件位置|ページ\s*ファイル.*場所|ページング\s*ファイル.*場所/i.test(
              kt
            ) &&
            String(val).trim()
          ) {
            return String(val).trim();
          }
          if (
            (/^page file$/i.test(kt) ||
              /^auslagerungsdatei$/i.test(kt) ||
              /^fichier d'échange$/i.test(kt) ||
              /^archivo de paginación$/i.test(kt) ||
              /^файл подкачки$/i.test(kt) ||
              /^ページ\s*ファイル$/i.test(kt) ||
              /^ページング\s*ファイル$/i.test(kt)) &&
            looksLikePageFilePath(String(val))
          ) {
            return String(val).trim();
          }
        }
      }
      return "";
    };

    const memory = {
      installedRam: pickSummaryMemory([
        /Installed Physical Memory \(RAM\)/i,
        /^Installed Physical Memory$/i,
        /^Installed RAM$/i,
        /^Installierter physischer Arbeitsspeicher/i,
        /Physischer Arbeitsspeicher.*RAM/i,
        /^Mémoire physique installée/i,
        /^Memoria física instalada/i,
        /^Memória física instalada/i,
        /Установленная оперативная память/i,
        /Установленн[\w\s,.-]*оперативн[\w\s,.-]*памят/i,
        /объём\s+оперативн[\w\s,.-]*памят/i,
        /объем\s+оперативн[\w\s,.-]*памят/i,
        /^已安装的物理内存/i,
        /^インストール済み(?:の)?物理メモリ/i,
        /物理メモリ.*RAM|RAM.*物理メモリ/i,
      ]),
      totalPhysical: pickSummaryMemory([
        /^Total Physical Memory$/i,
        /^Gesamter physischer Arbeitsspeicher$/i,
        /^Mémoire physique totale$/i,
        /^Memoria física \(total\)/i,
        /^Memória física total$/i,
        /^Всего физической памяти/i,
        /Полный объем физической памяти/i,
        /^物理内存总量$/i,
        /^合計の物理メモリ/i,
        /^合計\s*物理メモリ/i,
        /^物理メモリの合計/i,
      ]),
      availablePhysical: pickSummaryMemory([
        /^Available Physical Memory$/i,
        /^Verfügbarer physischer Arbeitsspeicher$/i,
        /^Mémoire physique disponible$/i,
        /^Memoria física disponible$/i,
        /^Memória física disponível$/i,
        /^Доступная физическая память/i,
        /Доступно физической памяти/i,
        /^可用物理内存$/i,
        /^利用可能な物理メモリ/i,
        /^使用可能な物理メモリ/i,
      ]),
      totalVirtual: pickSummaryMemory([
        /^Total Virtual Memory$/i,
        /^Gesamter virtueller Arbeitsspeicher$/i,
        /^Mémoire virtuelle totale$/i,
        /^Memoria virtual \(total\)/i,
        /^Memória virtual total$/i,
        /^Всего виртуальной памяти/i,
        /^虚拟内存总量$/i,
        /^合計の仮想メモリ/i,
        /^合計\s*仮想メモリ/i,
        /^仮想メモリの合計/i,
      ]),
      availableVirtual: pickSummaryMemory([
        /^Available Virtual Memory$/i,
        /^Verfügbarer virtueller Arbeitsspeicher$/i,
        /^Mémoire virtuelle disponible$/i,
        /^Memoria virtual disponible$/i,
        /^Memória virtual disponível$/i,
        /^Доступная виртуальная память/i,
        /Доступно виртуальной памяти/i,
        /^可用虚拟内存$/i,
        /^利用可能な仮想メモリ/i,
        /^使用可能な仮想メモリ/i,
      ]),
      pageFileSpace: pickSummaryMemory([
        /Page File Space/i,
        /Paging File Space/i,
        /Auslagerungsdateigröße/i,
        /Größe der Auslagerungsdatei/i,
        /Espace du fichier d'échange/i,
        /Espacio del archivo de paginación/i,
        /Espaço do arquivo de paginação/i,
        /Размер файла подкачки/i,
        /分页文件空间/i,
        /^ページ\s*ファイルのサイズ/i,
        /^ページング\s*ファイルのサイズ/i,
        /^ページ\s*ファイル\s*空間/i,
      ]),
      pageFileLocation: pickPageFileLocation(),
    };

    const storageDrives = extractStorageDrives(kvs, rows);
    const startupPrograms = extractStartupPrograms(kvs, rows);
    const servicesBundle = extractServicesBundle(kvs, rows);
    const windowsErrorReports = extractWindowsErrorReports(kvs, rows);

    return {
      motherboard,
      systemForm,
      systemTypeRaw,
      processor,
      platformRole,
      timeZone,
      memory,
      storageDrives,
      startupPrograms,
      servicesAll: servicesBundle.all,
      runningServices: servicesBundle.running,
      windowsErrorReports,
      biosVersion,
      biosDate,
      os: {
        name: osName,
        versionLine: osVersionLine,
        build: osBuild,
        installDate: osInstallDate,
      },
      biosMeta: {
        ageDays: biosAgeDays,
        parsed: biosDateObj != null,
      },
      graphics: {
        adapters: graphics.adapters,
        intel: graphics.intel,
        nvidia: graphics.nvidia,
      },
      problems,
      networkAdapters,
    };
  }

  /**
   * Removes XML 1.0 illegal characters (keeps tab, LF, CR).
   * @param {string} s
   * @returns {string}
   */
  function stripIllegalXmlChars(s) {
    return s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
  }

  /** Replace lone UTF-16 surrogates (common in corrupted UTF-16 exports) with U+FFFD. */
  function stripLoneUtf16Surrogates(s) {
    try {
      return s
        .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, "\uFFFD")
        .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "\uFFFD");
    } catch {
      return s;
    }
  }

  /**
   * Some exports include a binary preamble, double BOMs, or zero‑width characters before the first tag.
   * @param {string} s
   */
  function alignMsInfoDecodedTextToXmlStart(s) {
    let u = stripLoneUtf16Surrogates(String(s ?? ""));
    u = u.replace(/^[\uFEFF\u200B\u200C\u200D\u2060\u180E]+/g, "");
    u = u.replace(/^[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]+/g, "");
    u = u.trimStart();
    if (u.startsWith("<") || u.startsWith("＜")) return u;
    const scanMax = Math.min(524288, u.length);
    const scan = u.slice(0, scanMax);
    const low = scan.toLowerCase();
    const needles = ["<?xml", "<msinfo", "<category", "<data"];
    let cut = -1;
    for (const nd of needles) {
      const j = low.indexOf(nd);
      if (j >= 0 && (cut < 0 || j < cut)) cut = j;
    }
    if (cut < 0) {
      /** Mis-decoded UTF-16 often yields stray 0x3C; do not trim to a random “<” unless it looks like a real tag. */
      const fw = scan.indexOf("＜");
      if (fw >= 0) cut = fw;
      if (cut < 0) {
        const tagish = /<(?:\?xml|[\w.\-]+)(\s|>|\/)/i;
        const m = tagish.exec(scan);
        if (m && m.index !== undefined) cut = m.index;
      }
    }
    if (cut > 0) return u.slice(cut);
    return u;
  }

  /**
   * Light repair for lightly corrupted MSInfo / system information (.nfo) XML.
   * @param {string} text
   * @returns {{ text: string, repairs: string[] }}
   */
  function repairMsInfoXmlText(text) {
    /** @type {string[]} */
    const repairs = [];
    let t = alignMsInfoDecodedTextToXmlStart(text.replace(/^\uFEFF/, "").trimStart());
    if (!t.startsWith("<")) return { text: t, repairs };

    const sur = stripLoneUtf16Surrogates(t);
    if (sur !== t) {
      t = sur;
      repairs.push("Replaced invalid UTF-16 surrogate halves.");
    }

    const stripped = stripIllegalXmlChars(t);
    if (stripped !== t) {
      t = stripped;
      repairs.push("Removed illegal XML 1.0 control characters.");
    }

    const entNorm = normalizeUnsupportedNamedEntitiesInXml(t);
    if (entNorm !== t) {
      t = entNorm;
      repairs.push("Replaced HTML-style named entities (e.g. &nbsp;) with XML-safe forms.");
    }

    const msOpen = t.match(/<MsInfo\b/i);
    if (msOpen && msOpen.index !== undefined) {
      const restFrom = t.slice(msOpen.index);
      if (!/<\/MsInfo\s*>/i.test(restFrom)) {
        const openCat = (t.match(/<Category\b/gi) || []).length;
        const closeCat = (t.match(/<\/Category>/gi) || []).length;
        const missing = Math.max(0, openCat - closeCat);
        for (let i = 0; i < missing; i++) t += "</Category>";
        t += "</MsInfo>";
        repairs.push(
          missing > 0
            ? `Appended ${missing} missing closing </Category> tag(s) and a </MsInfo> root closer.`
            : "Appended missing </MsInfo> root closer."
        );
      }
    }

    const parser = new DOMParser();
    let doc = parser.parseFromString(t, "application/xml");
    if (!doc.querySelector("parsererror")) {
      return { text: t, repairs };
    }

    const ampFixed = t.replace(/&(?!amp;|lt;|gt;|apos;|quot;|#\d+;|#x[0-9A-Fa-f]+;)/g, "&amp;");
    if (ampFixed !== t) {
      t = ampFixed;
      repairs.push("Escaped bare ampersand characters not part of valid XML entities as &amp;.");
    }

    const docCheck = parser.parseFromString(t, "application/xml");
    if (!docCheck.querySelector("parsererror")) {
      return { text: t, repairs };
    }
    return { text: t, repairs };
  }

  /**
   * Parses MSInfo XML; applies {@link repairMsInfoXmlText} when the strict parse fails.
   * @param {string} text
   * @returns {Document | null} After in-parser repair, the document may carry {@code _msinfoRepairs}.
   */
  function parseMsInfoDocument(text) {
    let trimmed = alignMsInfoDecodedTextToXmlStart(text.replace(/^\uFEFF/, "").trimStart());
    if (!trimmed.startsWith("<")) return null;
    trimmed = normalizeUnsupportedNamedEntitiesInXml(trimmed);
    const parser = new DOMParser();
    /** @type {Document} */
    let doc = parser.parseFromString(trimmed, "application/xml");
    if (!doc.querySelector("parsererror")) {
      return doc;
    }

    const { text: fixedText, repairs } = repairMsInfoXmlText(trimmed);
    doc = parser.parseFromString(fixedText, "application/xml");
    if (doc.querySelector("parsererror")) return null;

    /** @type {any} */
    const d = doc;
    d._msinfoFixedSource = fixedText;
    if (repairs.length) d._msinfoRepairs = repairs;
    return doc;
  }

  /** XML 1.0 — strip disallowed control chars (keep tab / LF / CR). */
  function stripXmlIllegalControls(s) {
    return stripIllegalXmlChars(s);
  }

  /**
   * Escape bare ampersands so strict XML parsers accept the string.
   * Leaves valid entities: &amp; &lt; … &name; &#digits; &#xhex;
   * @param {string} s
   */
  function escapeBareAmpersandsForXml(s) {
    return s.replace(/&(?!([a-zA-Z][a-zA-Z0-9]*|#[0-9]+|#x[0-9a-fA-F]+);)/g, "&amp;");
  }

  /**
   * XML built-ins are only amp, lt, gt, apos, quot. HTML names like {@code &nbsp;} make DOMParser fail.
   * Known names become numeric refs; unknown {@code &Name;} become {@code &amp;Name;} so the tree can load.
   * @param {string} s
   */
  function normalizeUnsupportedNamedEntitiesInXml(s) {
    const predefined = new Set(["amp", "lt", "gt", "apos", "quot"]);
    /** @type {Record<string, string>} */
    const map = {
      nbsp: "&#160;",
      copy: "&#169;",
      reg: "&#174;",
      trade: "&#8482;",
      micro: "&#181;",
      para: "&#182;",
      middot: "&#183;",
      bull: "&#8226;",
      hellip: "&#8230;",
      ndash: "&#8211;",
      mdash: "&#8212;",
      ldquo: "&#8220;",
      rdquo: "&#8221;",
      lsquo: "&#8216;",
      rsquo: "&#8217;",
      deg: "&#176;",
      frac12: "&#189;",
      euro: "&#8364;",
      pound: "&#163;",
      yen: "&#165;",
    };
    return s.replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (full, name) => {
      const low = String(name).toLowerCase();
      if (predefined.has(low)) return full;
      if (map[low]) return map[low];
      return `&amp;${name};`;
    });
  }

  /**
   * Heuristic: append missing </Category> and </MsInfo> when counts are off (truncated export).
   * @param {string} s
   */
  function balanceTrailingMsInfoTags(s) {
    let out = s;
    const opens = (out.match(/<Category\b/gi) || []).length;
    const closes = (out.match(/<\/Category>/gi) || []).length;
    const need = opens - closes;
    if (need > 0 && need < 800) {
      for (let i = 0; i < need; i++) out += "</Category>";
    }
    const t = out.trimEnd();
    if (/<MsInfo\b/i.test(out) && !/<\/MsInfo\s*>$/i.test(t)) {
      out = `${out.trimEnd()}\n</MsInfo>\n`;
    }
    return out;
  }

  /** @param {string} inner */
  function decodeXmlishText(inner) {
    return inner
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&apos;/gi, "'")
      .replace(/&quot;/gi, '"')
      .replace(/&amp;/gi, "&");
  }

  /**
   * @param {string} attrBlob text inside <Data ...> before / or >
   * @returns {{ item: string, value: string }}
   */
  function parseDataAttrBlob(attrBlob) {
    const norm = (/** @type {string} */ x) => String(x || "").replace(/\s+/g, " ").trim();
    let item = "";
    let value = "";
    const im = attrBlob.match(/\bItem\s*=\s*("([^"]*)"|'([^']*)')/i);
    if (im) item = im[2] != null ? im[2] : im[3] || "";
    const imRu = attrBlob.match(/(?:^|[\s,])Элемент\s*=\s*("([^"]*)"|'([^']*)')/i);
    if (!item.trim() && imRu) item = imRu[2] != null ? imRu[2] : imRu[3] || "";
    const imFr = attrBlob.match(/(?:^|[\s,])Élément\s*=\s*("([^"]*)"|'([^']*)')/i);
    if (!item.trim() && imFr) item = imFr[2] != null ? imFr[2] : imFr[3] || "";
    const imJa = attrBlob.match(/(?:^|[\s,])項目\s*=\s*("([^"]*)"|'([^']*)')/);
    if (!item.trim() && imJa) item = imJa[2] != null ? imJa[2] : imJa[3] || "";
    const vm = attrBlob.match(/\bValue\s*=\s*("([^"]*)"|'([^']*)')/i);
    if (vm) value = vm[2] != null ? vm[2] : vm[3] || "";
    const vmRu = attrBlob.match(/(?:^|[\s,])Значение\s*=\s*("([^"]*)"|'([^']*)')/i);
    if (!value.trim() && vmRu) value = vmRu[2] != null ? vmRu[2] : vmRu[3] || "";
    const vmFr = attrBlob.match(/(?:^|[\s,])Valeur\s*=\s*("([^"]*)"|'([^']*)')/i);
    if (!value.trim() && vmFr) value = vmFr[2] != null ? vmFr[2] : vmFr[3] || "";
    const vmJa = attrBlob.match(/(?:^|[\s,])値\s*=\s*("([^"]*)"|'([^']*)')/);
    if (!value.trim() && vmJa) value = vmJa[2] != null ? vmJa[2] : vmJa[3] || "";
    return { item: norm(item), value: norm(decodeXmlishText(value)) };
  }

  /** @param {string} inner XML body of a Data element (loose text scan). */
  function looseDataInnerToItemValue(inner) {
    const normInner = (/** @type {string} */ s) =>
      decodeXmlishText(String(s || "").replace(/\s+/g, " ").trim());
    const pairs = [
      [/<Item\b[^>]*>([\s\S]*?)<\/Item>/i, /<Value\b[^>]*>([\s\S]*?)<\/Value>/i],
      [/<Элемент\b[^>]*>([\s\S]*?)<\/Элемент>/i, /<Значение\b[^>]*>([\s\S]*?)<\/Значение>/i],
      [/<Élément\b[^>]*>([\s\S]*?)<\/Élément>/i, /<Valeur\b[^>]*>([\s\S]*?)<\/Valeur>/i],
      [/<項目\b[^>]*>([\s\S]*?)<\/項目>/, /<値\b[^>]*>([\s\S]*?)<\/値>/],
      [/<元素\b[^>]*>([\s\S]*?)<\/元素>/, /<值\b[^>]*>([\s\S]*?)<\/值>/],
      [/<항목\b[^>]*>([\s\S]*?)<\/항목>/, /<값\b[^>]*>([\s\S]*?)<\/값>/],
      [/<Eintrag\b[^>]*>([\s\S]*?)<\/Eintrag>/i, /<Wert\b[^>]*>([\s\S]*?)<\/Wert>/i],
    ];
    for (const [itemRe, valRe] of pairs) {
      const im = inner.match(itemRe);
      const vm = inner.match(valRe);
      if (im || vm) {
        return {
          item: im ? normInner(im[1]) : "",
          value: vm ? normInner(vm[1]) : "",
        };
      }
    }
    return { item: "", value: "" };
  }

  /**
   * When DOM parsing fails, scan for MSInfo-style Category + Data tags (handles truncated / malformed XML).
   * @param {string} text
   * @returns {{ kvs: { path: string, item: string, value: string }[], rows: { path: string, fields: Record<string, string> }[] }}
   */
  function extractMsInfoLooseFromText(text) {
    /** @type {{ path: string, item: string, value: string }[]} */
    const kvs = [];
    /** @type {{ path: string, fields: Record<string, string> }[]} */
    const rows = [];
    const stack = [];
    const pathStr = () => stack.join(" / ");

    let i = 0;
    const n = text.length;
    while (i < n) {
      const lt = text.indexOf("<", i);
      if (lt < 0) break;
      const rest = text.slice(lt);

      let m = rest.match(/^<Category\b[^>]*\bname\s*=\s*("([^"]*)"|'([^']*)')[^>]*>/i);
      if (!m) m = rest.match(/^<Category\b[^>]*名前\s*=\s*("([^"]*)"|'([^']*)')[^>]*>/);
      if (m) {
        const name = (m[2] != null ? m[2] : m[3] || "").replace(/\s+/g, " ").trim();
        if (name) stack.push(name);
        i = lt + m[0].length;
        continue;
      }

      m = rest.match(/^<\/Category\s*>/i);
      if (m) {
        if (stack.length) stack.pop();
        i = lt + m[0].length;
        continue;
      }

      m = rest.match(/^<(?:[\w.\-]+:)?Data\b([^>]*?)\/\s*>/i);
      if (!m) m = rest.match(/^<(?:[\w.\-]+:)?データ\b([^>]*?)\/\s*>/);
      if (m) {
        const { item, value } = parseDataAttrBlob(m[1] || "");
        if (item || value) kvs.push({ path: pathStr(), item, value });
        i = lt + m[0].length;
        continue;
      }

      m = rest.match(/^<(?:[\w.\-]+:)?Data\b([^>]*)>([\s\S]*?)<\/(?:[\w.\-]+:)?Data\s*>/i);
      if (!m) m = rest.match(/^<(?:[\w.\-]+:)?データ\b([^>]*)>([\s\S]*?)<\/(?:[\w.\-]+:)?データ\s*>/);
      if (m) {
        const inner = m[2] || "";
        let { item, value } = looseDataInnerToItemValue(inner);
        if (!item && !value) {
          const blob = m[1] || "";
          const p = parseDataAttrBlob(blob);
          item = p.item;
          value = p.value;
        }
        if (item || value) kvs.push({ path: pathStr(), item, value });
        i = lt + m[0].length;
        continue;
      }

      i = lt + 1;
    }

    return { kvs, rows };
  }

  /**
   * msinfo32 can save a plain-text, tab-separated report (not XML) — common for Japanese UI exports.
   * @param {string} s
   */
  function looksLikeMsInfoPlainTextTabExport(s) {
    const t = String(s || "");
    const head = t.slice(0, Math.min(250000, t.length));
    if (!head.includes("\t")) return false;
    const ja =
      /システム情報/.test(head) ||
      /\[システムの要約\]/.test(head) ||
      (/項目/.test(head) && /値/.test(head) && /\t/.test(head));
    const en =
      /system\s+information\s+(report|was\s+written|saved)/i.test(head) ||
      /\[\s*system\s+summary\s*\]/i.test(head) ||
      /\bitem\s*\t+\s*value\b/i.test(head);
    const zh = /系统信息/.test(head) || (/项目/.test(head) && /值/.test(head));
    const ko = /시스템\s*정보/.test(head) || (/항목/.test(head) && /값/.test(head));
    if (ja || en || zh || ko) return true;
    /** Locale-neutral: many bracketed sections + tab-separated rows (common msinfo text export shape). */
    const lines = head.split(/\r?\n/);
    let sections = 0;
    let tabRows = 0;
    for (const raw of lines) {
      const ln = raw.trim();
      if (/^\[[^\]\r\n]{1,200}\]\s*$/.test(ln)) sections++;
      if (!ln.includes("\t")) continue;
      const parts = ln.split("\t").filter((p) => String(p).trim().length);
      if (parts.length >= 2) tabRows++;
    }
    return sections >= 2 && tabRows >= 4;
  }

  /**
   * Parse msinfo32 plain-text export: section lines "[Name]", optional "Item\tValue" header, then "item\tvalue" rows.
   * @param {string} text
   * @returns {{ kvs: { path: string, item: string, value: string }[], rows: { path: string, fields: Record<string, string> }[] }}
   */
  function extractMsInfoPlainTextTabExport(text) {
    /** @type {{ path: string, item: string, value: string }[]} */
    const kvs = [];
    /** @type {{ path: string, fields: Record<string, string> }[]} */
    const rows = [];
    const norm = (/** @type {string} */ x) => String(x || "").replace(/\r/g, "").trim();
    const isHeaderPair = (/** @type {string} */ item, /** @type {string} */ val) => {
      const a = item.normalize("NFKC").toLowerCase();
      const b = val.normalize("NFKC").toLowerCase();
      const pairs = [
        ["項目", "値"],
        ["项目", "值"],
        ["item", "value"],
        ["항목", "값"],
        ["элемент", "значение"],
        ["élément", "valeur"],
        ["element", "wert"],
        ["elemento", "valor"],
      ];
      return pairs.some(([p, q]) => a === p && b === q);
    };
    let section = "";
    let seenSection = false;
    const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    for (let raw of lines) {
      const line = raw.replace(/\uFEFF/g, "");
      const trimmed = line.trim();
      if (!trimmed) continue;

      const sec = trimmed.match(/^\[(.+)\]\s*$/);
      if (sec) {
        section = norm(sec[1]);
        seenSection = true;
        continue;
      }

      if (trimmed.includes("\t")) {
        const parts = trimmed.split("\t");
        while (parts.length && norm(parts[parts.length - 1]) === "") parts.pop();
        if (parts.length < 2) continue;
        const item = norm(parts[0]);
        const value = norm(parts.slice(1).join("\t"));
        if (!item && !value) continue;
        if (isHeaderPair(item, value)) continue;
        const pathStr = section;
        kvs.push({ path: pathStr, item, value });
        continue;
      }

      if (!seenSection) {
        const kv = trimmed.match(/^([^:\t：]+)[:：]\s*(.*)$/);
        if (kv) {
          const item = norm(kv[1]);
          const value = norm(kv[2]);
          if (item && value) kvs.push({ path: "", item, value });
        }
      }
    }
    return { kvs, rows };
  }

  /**
   * @param {string} src
   * @param {{ kvs: { path: string, item: string, value: string }[], rows: unknown[] }} data
   */
  function shouldAcceptPlainMsInfoExtract(src, data) {
    if (data.kvs.length >= 2) return true;
    if (looksLikeMsInfoPlainTextTabExport(src) && data.kvs.length >= 1) return true;
    if (scorePlainTextMsInfoExport(src) >= 48 && data.kvs.length >= 1) return true;
    return false;
  }

  /**
   * @param {string} original raw decoded text
   * @returns {{
   *   doc: Document | null,
   *   data: { kvs: { path: string, item: string, value: string }[], rows: { path: string, fields: Record<string, string> }[] } | null,
   *   mode: "xml" | "repaired" | "loose" | "plaintext" | "none",
   *   notes: string[],
   *   repairedText: string | null,
   *   rawDisplayText: string
   * }}
   */
  function parseMsInfoDocumentWithRecovery(original) {
    /** @type {string[]} */
    const notes = [];
    let repairedText = /** @type {string | null} */ (null);
    const sourceDecoded = stripLoneUtf16Surrogates(String(original ?? ""));
    const baseline = alignMsInfoDecodedTextToXmlStart(sourceDecoded.replace(/^\uFEFF/, "").trimStart());
    const leadTrim = sourceDecoded.replace(/^[\uFEFF\u200B\u200C\u200D\u2060]+/g, "").trimStart();
    if (baseline.startsWith("<") && !leadTrim.startsWith("<")) {
      notes.push("Skipped leading characters before the first “<” so MSInfo XML could be read.");
    }

    const tryDom = (/** @type {string} */ t) => parseMsInfoDocument(t);

    let doc = tryDom(baseline);
    if (doc) {
      const fixedSrc = /** @type {any} */ (doc)._msinfoFixedSource || null;
      const rawDisplayText = fixedSrc || baseline;
      if (fixedSrc && fixedSrc !== baseline) {
        notes.push(
          "The export was repaired internally for parsing. The raw text area shows the repaired XML by default — use “Show original file” in the toolbar to view the decoded file as stored."
        );
      }
      return {
        doc,
        data: null,
        mode: fixedSrc ? "repaired" : "xml",
        notes,
        repairedText: fixedSrc || null,
        rawDisplayText,
      };
    }

    const plainEarly = extractMsInfoPlainTextTabExport(sourceDecoded);
    const xmlHead = sourceDecoded.slice(0, Math.min(500000, sourceDecoded.length));
    const hasXmlExportShape =
      /<\?xml\b|<MsInfo\b|<Category\b|<Data\b|<\/MsInfo>|<\/Category>/i.test(xmlHead);
    if (!hasXmlExportShape && shouldAcceptPlainMsInfoExtract(sourceDecoded, plainEarly)) {
      notes.push(
        "Decoded as msinfo32 plain-text / tab export (not XML). Sections “[…]” become category paths; “Item” and “Value” columns are tab-separated rows."
      );
      return {
        doc: null,
        data: plainEarly,
        mode: "plaintext",
        notes,
        repairedText: null,
        rawDisplayText: sourceDecoded,
      };
    }

    let t = baseline;
    if (!t.startsWith("<")) {
      const tryPlain = (/** @type {string} */ src, /** @type {string} */ rawDisp) => {
        const data = extractMsInfoPlainTextTabExport(src);
        if (!shouldAcceptPlainMsInfoExtract(src, data)) return null;
        notes.push(
          "Decoded as msinfo32 plain-text / tab export (not XML). Sections “[…]” become category paths; “Item” and “Value” columns are tab-separated rows."
        );
        return { doc: null, data, mode: "plaintext", notes, repairedText: null, rawDisplayText: rawDisp };
      };
      const plain0 = tryPlain(baseline, baseline);
      if (plain0) return plain0;
      const plain1 = tryPlain(sourceDecoded, sourceDecoded);
      if (plain1) return plain1;

      const loose0 = extractMsInfoLooseFromText(baseline);
      if (loose0.kvs.length) {
        notes.push("File does not look like complete XML; built a partial summary from visible <Data> rows.");
        return { doc: null, data: loose0, mode: "loose", notes, repairedText: null, rawDisplayText: baseline };
      }
      const loose1 = extractMsInfoLooseFromText(sourceDecoded);
      if (loose1.kvs.length) {
        notes.push("File does not look like complete XML; built a partial summary from visible <Data> rows.");
        return { doc: null, data: loose1, mode: "loose", notes, repairedText: null, rawDisplayText: sourceDecoded };
      }
      /** @type {string[]} */
      const noneNotes = [
        "Not recognized as MSInfo / XML text (no opening “<” tag in the decoded content).",
        "If this is a text export from msinfo32, re-save as .nfo XML, or try Encoding → UTF-16 BE / UTF-8 / Windows-31J.",
      ];
      return {
        doc: null,
        data: null,
        mode: "none",
        notes: notes.length ? notes.concat(noneNotes) : noneNotes,
        repairedText: null,
        rawDisplayText: sourceDecoded,
      };
    }

    let working = t;
    const s0 = stripXmlIllegalControls(working);
    if (s0 !== working) notes.push("Removed illegal XML control characters (NUL / other C0 codes).");
    working = s0;

    const sEnt = normalizeUnsupportedNamedEntitiesInXml(working);
    if (sEnt !== working) {
      notes.push("Replaced HTML-style named entities (e.g. &nbsp;) with XML-safe numeric or escaped forms.");
    }
    working = sEnt;

    const s1 = escapeBareAmpersandsForXml(working);
    if (s1 !== working) notes.push("Escaped bare “&” characters that were not valid XML entities.");
    working = s1;

    const s2 = balanceTrailingMsInfoTags(working);
    if (s2 !== working) notes.push("Appended missing closing </Category> / </MsInfo> tags (truncated export heuristic).");
    working = s2;

    doc = tryDom(working);
    if (doc) {
      repairedText = working !== baseline ? working : null;
      notes.unshift(
        "Repaired a copy in memory for parsing. The raw text area shows this repaired XML by default — use “Show original file” to compare with the decoded file."
      );
      return { doc, data: null, mode: "repaired", notes, repairedText, rawDisplayText: working };
    }

    let loose = extractMsInfoLooseFromText(working);
    let rawLoose = working;
    if (!loose.kvs.length) {
      loose = extractMsInfoLooseFromText(baseline);
      rawLoose = baseline;
    }
    if (!loose.kvs.length) {
      loose = extractMsInfoLooseFromText(sourceDecoded);
      rawLoose = sourceDecoded;
    }
    if (loose.kvs.length) {
      notes.push(
        "XML is still not well-formed; extracted fields using a tolerant tag scan (some rows may be missing). The raw area shows the best-effort cleaned text used for that scan."
      );
      return { doc: null, data: loose, mode: "loose", notes, repairedText: null, rawDisplayText: rawLoose };
    }

    const plainTail = extractMsInfoPlainTextTabExport(sourceDecoded);
    if (shouldAcceptPlainMsInfoExtract(sourceDecoded, plainTail)) {
      notes.push(
        "XML parsing failed, but a msinfo32-style plain-text / tab report was detected and parsed instead."
      );
      return {
        doc: null,
        data: plainTail,
        mode: "plaintext",
        notes,
        repairedText: null,
        rawDisplayText: sourceDecoded,
      };
    }

    return {
      doc: null,
      data: null,
      mode: "none",
      notes: notes.length ? notes.concat(["Parser could not build a document tree."]) : ["Could not parse MSInfo XML."],
      repairedText: null,
      rawDisplayText: baseline,
    };
  }

  /** @param {Record<string, unknown> | null | undefined} g */
  function hasIntelGpuContent(g) {
    return !!(g && (g.name || g.resolution || g.driverFull || g.adapterType || g.deviceId));
  }

  /**
   * @param {{ adapters?: unknown[] | null, intel?: unknown, nvidia?: unknown } | null | undefined} graphics
   * @param {(s: string) => string} esc
   * @param {boolean} [embedOnly] when true, return inner grid only (wrapped by parent accordion)
   */
  function renderGpuDashboard(graphics, esc, embedOnly) {
    /** @type {{ g: Record<string, unknown> | null | undefined, legacyNvidiaSlot: boolean }[]} */
    const units = [];
    if (Array.isArray(graphics?.adapters) && graphics.adapters.length > 0) {
      for (const a of graphics.adapters) {
        if (a && typeof a === "object" && hasGpuCardContent(/** @type {Record<string, unknown>} */ (a))) {
          units.push({ g: /** @type {Record<string, unknown>} */ (a), legacyNvidiaSlot: false });
        }
      }
    }
    if (units.length === 0) {
      if (hasIntelGpuContent(graphics?.intel)) {
        units.push({
          g: /** @type {Record<string, unknown>} */ (graphics.intel),
          legacyNvidiaSlot: false,
        });
      }
      units.push({
        g: graphics?.nvidia ? /** @type {Record<string, unknown>} */ (graphics.nvidia) : null,
        legacyNvidiaSlot: true,
      });
    }

    const cards = units.map((u, i) => renderGpuSubcard(i + 1, u.g, esc, u.legacyNvidiaSlot));
    const grid = `<div class="gpu-dashboard__grid">${cards.join("")}</div>`;

    if (embedOnly) {
      return `<div class="gpu-dashboard__body-inner gpu-dashboard__body-inner--embed">${grid}</div>`;
    }

    return `<section class="gpu-dashboard summary-card summary-card--wide" aria-label="Graphics adapters">
      <details class="gpu-dashboard__details" open>
        <summary class="gpu-dashboard__summary">
          <span class="gpu-dashboard__summary-icon" aria-hidden="true"><svg class="gpu-dashboard__summary-svg" viewBox="0 0 24 24" width="22" height="22" focusable="false"><rect x="2" y="5" width="20" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 21h8M12 18v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span>
          <span class="gpu-dashboard__summary-text">Graphics Processing Unit (GPU)</span>
          <span class="gpu-dashboard__summary-chevron" aria-hidden="true"></span>
        </summary>
        <div class="gpu-dashboard__body-inner">
          ${grid}
        </div>
      </details>
    </section>`;
  }

  /**
   * @param {number} index
   * @param {Record<string, unknown> | null | undefined} g
   * @param {(s: string) => string} esc
   * @param {boolean} legacyNvidiaSlot legacy layout: last slot is the optional NVIDIA placeholder.
   */
  function renderGpuSubcard(index, g, esc, legacyNvidiaSlot) {
    const emptyNvidia = legacyNvidiaSlot && (!g || !hasGpuCardContent(g));
    if (emptyNvidia) {
      return `<article class="gpu-subcard gpu-subcard--placeholder" data-gpu-index="${index}">
        <div class="gpu-subcard__kicker">GPU ${index} — NVIDIA</div>
        <p class="gpu-subcard__empty">No NVIDIA adapter found in this export.</p>
      </article>`;
    }
    const gg = g || {};
    const vendorStr = String(gg.vendorLabel || gpuVendorLabelFromName(String(gg.name || "")));
    const vendor = esc(vendorStr);
    const isNvidia = /NVIDIA/i.test(vendorStr);
    const isIntel = /INTEL/i.test(vendorStr);
    const name = sumI18nSpan(String(gg.name || ""), esc);
    const pciUrl = gg.pciLookupUrl
      ? String(gg.pciLookupUrl)
      : gg.deviceHuntUrl
        ? String(gg.deviceHuntUrl)
        : "";
    const dv = gg.driverVersionDisplay || gg.driverFormatted || gg.driverFull;
    let driverVersion = sumI18nSpan(String(dv || "—"), esc);
    if (isNvidia && gg.driverFormatted && gg.driverFull && String(gg.driverFormatted) !== String(gg.driverFull)) {
      driverVersion += ` <span class="summary-empty">(internal: ${esc(String(gg.driverFull))})</span>`;
    } else if (isIntel && gg.driverFull) {
      driverVersion += ` <span class="summary-empty">(Intel — raw from MSInfo)</span>`;
    }
    const driverDate = sumI18nSpan(String(gg.driverDate || "—"), esc);
    const deviceId = sumI18nSpan(String(gg.deviceId || "—"), esc);
    const adapterType = sumI18nSpan(String(gg.adapterType || "—"), esc);
    const adapterRam = sumI18nSpan(String(gg.adapterRam || "—"), esc);

    let resLine = "Not Available";
    if (gg.resolution && String(gg.resolution).trim() && !/^not available|^n\/a$/i.test(String(gg.resolution).trim())) {
      resLine = String(gg.resolution);
    } else if (isNvidia && gg.drivesDisplay === false) {
      resLine =
        "Not listed under NVIDIA in this export (common on hybrid graphics — see Intel for panel resolution).";
    }
    const resolution = sumI18nSpan(resLine, esc);

    const pciBtn = pciUrl
      ? `<a class="gpu-pci-lookup" href="${esc(pciUrl)}" target="_blank" rel="noopener noreferrer" title="Open PCILookup.com with vendor and device ID filled in"><svg class="gpu-pci-lookup__icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><rect x="3" y="6" width="18" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 10h10M7 14h7" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/><circle cx="17" cy="5" r="3.5" fill="none" stroke="currentColor" stroke-width="1.75"/><path d="M19.2 7.2l2.3 2.3" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg><span class="visually-hidden">PCI lookup (prefilled)</span></a>`
      : "";

    return `<article class="gpu-subcard" data-gpu-index="${index}">
      <div class="gpu-subcard__kicker">GPU ${index} — ${vendor}</div>
      <div class="gpu-subcard__title-row">
        <strong class="gpu-subcard__name">${name}</strong>
        ${pciBtn}
      </div>
      <dl class="gpu-subcard__facts">
        <dt>Driver Version</dt><dd>${driverVersion}</dd>
        <dt>Driver Date</dt><dd>${driverDate}</dd>
        <dt>Device ID</dt><dd>${deviceId}</dd>
        <dt>Adapter Type</dt><dd>${adapterType}</dd>
        <dt>Adapter RAM</dt><dd>${adapterRam}</dd>
        <dt>Resolution</dt><dd>${resolution}</dd>
      </dl>
    </article>`;
  }

  /**
   * @param {string} kind icon key
   * @returns {string} static SVG markup
   */
  function reportCategoryIconSvg(kind) {
    switch (kind) {
      case "warn":
        return `<svg class="report-category__svg" viewBox="0 0 24 24" width="20" height="20" focusable="false" aria-hidden="true"><path d="M12 4l9 16H3L12 4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 10v4M12 17h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
      case "memory":
        return `<svg class="report-category__svg" viewBox="0 0 24 24" width="20" height="20" focusable="false" aria-hidden="true"><rect x="4" y="6" width="16" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 10h8M8 14h5" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>`;
      case "disk":
        return `<svg class="report-category__svg" viewBox="0 0 24 24" width="20" height="20" focusable="false" aria-hidden="true"><ellipse cx="12" cy="6" rx="7" ry="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 6v6c0 1.7 3 3 7 3s7-1.3 7-3V6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 12v2c0 1.7 3 3 7 3s7-1.3 7-3v-2" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
      case "startup":
        return `<svg class="report-category__svg" viewBox="0 0 24 24" width="20" height="20" focusable="false" aria-hidden="true"><path d="M5 5h14v4H5zM5 13h14v6H5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M8 8h4M8 16h8" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>`;
      case "services":
        return `<svg class="report-category__svg" viewBox="0 0 24 24" width="20" height="20" focusable="false" aria-hidden="true"><circle cx="8" cy="8" r="2.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="16" cy="8" r="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 10.5v3c0 2 2.5 3.5 4 3.5s4-1.5 4-3.5v-3" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
      case "running":
        return `<svg class="report-category__svg" viewBox="0 0 24 24" width="20" height="20" focusable="false" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 9l6 3-6 3V9z" fill="currentColor"/></svg>`;
      case "wer":
        return `<svg class="report-category__svg" viewBox="0 0 24 24" width="20" height="20" focusable="false" aria-hidden="true"><path d="M7 3h10l3 5-8 13L4 8l3-5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 9v4M12 16h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
      case "os":
        return `<svg class="report-category__svg" viewBox="0 0 24 24" width="20" height="20" focusable="false" aria-hidden="true"><rect x="3" y="4" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 8h10M7 12h6" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>`;
      case "rec":
        return `<svg class="report-category__svg" viewBox="0 0 24 24" width="20" height="20" focusable="false" aria-hidden="true"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.5V17h8v-2.5A7 7 0 0 0 12 2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`;
      case "mb":
        return `<svg class="report-category__svg" viewBox="0 0 24 24" width="20" height="20" focusable="false" aria-hidden="true"><rect x="4" y="5" width="16" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 9h8M8 13h5" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/><circle cx="9" cy="17" r="1.2" fill="currentColor"/></svg>`;
      case "bios":
        return `<svg class="report-category__svg" viewBox="0 0 24 24" width="20" height="20" focusable="false" aria-hidden="true"><rect x="7" y="3" width="10" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 7h4M10 11h4" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>`;
      case "network":
        return `<svg class="report-category__svg" viewBox="0 0 24 24" width="20" height="20" focusable="false" aria-hidden="true"><path d="M5 12a7 7 0 0 1 14 0" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 12a4 4 0 0 1 8 0" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>`;
      case "gpu":
        return `<svg class="report-category__svg" viewBox="0 0 24 24" width="20" height="20" focusable="false" aria-hidden="true"><rect x="2" y="5" width="20" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 21h8M12 18v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
      case "system":
      default:
        return `<svg class="report-category__svg" viewBox="0 0 24 24" width="20" height="20" focusable="false" aria-hidden="true"><rect x="4" y="4" width="16" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 20h8M12 14v6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
    }
  }

  /**
   * True when text looks non-English for common Windows display languages (Arabic, CJK, Cyrillic, Greek, Hangul, kana, Latin with European diacritics).
   * Used to show the section Translate control; phrase maps cover Russian + intl. pairs below as best-effort.
   * @param {string} s
   */
  function localeScriptLooksNonEnglishListed(s) {
    const t = String(s || "").replace(/<[^>]*>/g, " ");
    if (!t.trim()) return false;
    if (/[\u0600-\u06FF]/.test(t)) return true;
    if (/[\u0400-\u04FF]/.test(t)) return true;
    if (/[\u0370-\u03FF]/.test(t)) return true;
    if (/[\u3040-\u30FF\u31F0-\u31FF]/.test(t)) return true;
    if (/[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/.test(t)) return true;
    if (/[\uAC00-\uD7AF]/.test(t)) return true;
    if (/[\u0100-\u024F\u1E00-\u1EFF]/.test(t)) return true;
    return false;
  }

  /**
   * Russian MSInfo / Windows UI → English (offline phrase map).
   * @type {readonly (readonly [string, string])[]}
   */
  const LOCALE_PAIRS_MSINFO_RU = [
        ["64-разрядная операционная система", "64-bit operating system"],
        ["32-разрядная операционная система", "32-bit operating system"],
        ["Компьютер на базе x64", "x64-based PC"],
        ["Компьютер на базе x86", "x86-based PC"],
        ["Компьютер на базе ARM64", "ARM64-based PC"],
        ["Компьютер на базе ARM", "ARM-based PC"],
        ["логических процессоров:", "logical processors:"],
        ["логических процессоров", "logical processors"],
        ["логических процессора:", "logical processors:"],
        ["логических процессора", "logical processors"],
        ["Корпорация Майкрософт", "Microsoft Corporation"],
        ["Установленная физическая память (ОЗУ)", "Installed Physical Memory (RAM)"],
        ["Установленная физическая память", "Installed Physical Memory"],
        ["Доступная физическая память", "Available Physical Memory"],
        ["Всего физической памяти", "Total Physical Memory"],
        ["Всего виртуальной памяти", "Total Virtual Memory"],
        ["Доступная виртуальная память", "Available Virtual Memory"],
        ["Локальный фиксированный диск", "Local Fixed Disk"],
        ["Дисковый накопитель", "Disk drive"],
        ["Съемное устройство хранения", "Removable storage"],
        ["Съемное устройство", "Removable device"],
        ["Оптический накопитель", "Optical drive"],
        ["Сетевой диск", "Network drive"],
        ["Локальный диск", "Local Disk"],
        ["гигабайта", "gigabytes"],
        ["терабайта", "terabytes"],
        ["мегабайта", "megabytes"],
        ["килобайта", "kilobytes"],
        ["гигабайт", "gigabyte"],
        ["терабайт", "terabyte"],
        ["мегабайт", "megabyte"],
        ["килобайт", "kilobyte"],
        [" байт)", " bytes)"],
        [" байт ", " bytes "],
        [") байт", ") bytes"],
        [")байт", ")bytes"],
        ["совместимый видеоадаптер", "compatible video adapter"],
        ["Direct3D-совместимый", "Direct3D-compatible"],
        ["NVIDIA-совместимый", "NVIDIA-compatible"],
        ["AMD-совместимый", "AMD-compatible"],
        ["Intel-совместимый", "Intel-compatible"],
        ["Встроенный видеоадаптер", "Integrated video adapter"],
        ["Основной дисплей", "Primary display"],
        ["Дополнительный дисплей", "Secondary display"],
        ["Расположение файла подкачки", "Page File Location"],
        ["Автоматически с отложенным запуском", "Automatic (Delayed Start)"],
        ["Вручную при отложенном запуске", "Manual (Trigger Start)"],
        ["Исходная дата установки", "Original Install Date"],
        ["Версия / серийный номер", "Version / serial number"],
        ["Файловая система", "File System"],
        ["Общий размер", "Total Size"],
        ["Серийный номер", "Serial Number"],
        ["Шлюз IP по умолчанию", "Default IP Gateway"],
        ["Шлюз по умолчанию", "Default Gateway"],
        ["Тип запуска", "Startup type"],
        ["Тип системы", "System Type"],
        ["Роль платформы", "Platform Role"],
        ["Часовой пояс", "Time Zone"],
        ["Дата установки", "Install date"],
        ["Имя тома", "Volume Name"],
        ["Имя службы", "Service name"],
        ["Имя подключения", "Connection name"],
        ["Тип продукта", "Product type"],
        ["Тип продукции", "Product type"],
        ["ID PNP-устройства", "PNP Device ID"],
        ["ИД PNP-устройства", "PNP Device ID"],
        ["Код PNP-устройства", "PNP Device ID"],
        ["Последний сброс", "Last reset"],
        ["Установлен", "Installed"],
        ["Установлено", "Installed"],
        ["Установлена", "Installed"],
        ["DHCP-аренда истекает", "DHCP lease expires"],
        ["DHCP-аренда получена", "DHCP lease obtained"],
        ["Срок аренды DHCP истекает", "DHCP lease expires"],
        ["Срок аренды DHCP получен", "DHCP lease obtained"],
        ["Дата окончания аренды DHCP", "DHCP lease expires"],
        ["Дата получения аренды DHCP", "DHCP lease obtained"],
        ["IP-адрес", "IP address"],
        ["Драйвер", "Driver"],
        ["Программная среда / Сообщения об ошибках Windows", "Software Environment / Windows Error Reporting"],
        ["Сообщения об ошибках Windows", "Windows Error Reporting"],
        ["Программная среда", "Software Environment"],
        ["Контейнер ошибки", "Error container"],
        ["Отклик: Нет данных", "Response: No data"],
        ["Идентификатор CAB:", "CAB ID:"],
        ["Идентификатор CAB", "CAB ID"],
        ["Имя события:", "Event name:"],
        ["Имя события", "Event name"],
        ["Отклик:", "Response:"],
        ["Нет данных", "No data"],
        ["Эти файлы можно найти здесь:", "These files can be found here:"],
        ["Сигнатура проблемы:", "Problem signature:"],
        ["Сигнатура проблемы", "Problem signature"],
        ["Вложенные файлы:", "Attached files:"],
        ["Вложенные файлы", "Attached files"],
        ["Символ анализа:", "Analysis symbol:"],
        ["Символ анализа", "Analysis symbol"],
        ["Повторный поиск решения:", "Searching for solutions:"],
        ["Повторный поиск решения", "Searching for solutions"],
        ["Хэшированный контейнер:", "Hashed container:"],
        ["Хэшированный контейнер", "Hashed container"],
        ["Идентификатор отчёта:", "Report identifier:"],
        ["Идентификатор отчёта", "Report identifier"],
        ["Идентификатор отчета:", "Report identifier:"],
        ["Идентификатор отчета", "Report identifier"],
        ["Identifier отчета:", "Report identifier:"],
        ["Identifier отчета", "Report identifier"],
        ["Состояние отчёта:", "Report state:"],
        ["Состояние отчёта", "Report state"],
        ["Состояние отчета:", "Report state:"],
        ["Состояние отчета", "Report state"],
        ["State отчета:", "Report state:"],
        ["State отчета", "Report state"],
        ["Identifier GUID CAB:", "CAB GUID identifier:"],
        [", тип ", ", type "],
        ["\nтип ", "\ntype "],
        ["Идентификатор", "Identifier"],
        ["Недоступно", "Unavailable"],
        ["Состояние IPv6", "IPv6 status"],
        ["Файл подкачки", "Page File"],
        ["Майкрософт", "Microsoft"],
        ["Сборка", "Build"],
        ["Версия", "Version"],
        ["Издание", "Edition"],
        ["Процессор", "Processor"],
        ["Классификация", "Classification"],
        ["Изготовитель", "Manufacturer"],
        ["Модель", "Model"],
        ["Свободно", "Free Space"],
        ["Занято", "Used"],
        ["Выполняется", "Running"],
        ["Остановлена", "Stopped"],
        ["Работает", "Running"],
        ["Запущена", "Running"],
        ["Отключена", "Disabled"],
        ["Отключено", "Disabled"],
        ["Автоматически", "Automatic"],
        ["Вручную", "Manual"],
        ["Имя", "Name"],
        ["Команда", "Command"],
        ["Расположение", "Location"],
        ["Пользователь", "User"],
        ["Состояние", "State"],
        ["Источник", "Source"],
        ["Время", "Time"],
        ["Описание", "Description"],
        ["Сеть", "Network"],
        ["Среда", "Environment"],
        ["Домен", "Domain"],
        ["Основной шлюз", "Default Gateway"],
        ["Носитель", "Medium"],
        ["Рабочий стол", "Desktop"],
        ["Серверная платформа", "Server"],
        ["Системный шкаф", "System rack"],
        ["ядер:", "cores:"],
        ["Мобильная система", "Mobile"],
        ["МГц", "MHz"],
        ["мГц", "MHz"],
        ["ГГц", "GHz"],
        ["гГц", "GHz"],
        ["кГц", "kHz"],
        ["Гц", "Hz"],
        ["(зима)", "(winter)"],
        ["(лето)", "(summer)"],
        ["ГБ", "GB"],
        ["ТБ", "TB"],
        ["МБ", "MB"],
        ["КБ", "KB"],
        ["Гб", "GB"],
        ["Тб", "TB"],
        ["Мб", "MB"],
        ["Кб", "KB"],
        ["Нет", "No"],
        ["Да", "Yes"],
  ];

  /**
   * Additional locales (Arabic, CJK, European Latin, Greek, Cyrillic variants, etc.) → English.
   * Merged with Russian; longest keys win globally after sort.
   * @type {readonly (readonly [string, string])[]}
   */
  const LOCALE_PAIRS_MSINFO_INTL = [
    // --- German (de) ---
    ["Softwareumgebung / Windows-Fehlerberichte", "Software Environment / Windows Error Reporting"],
    ["Windows-Fehlerberichte", "Windows Error Reporting"],
    ["Fehlercontainer", "Error container"],
    ["Ereignisname:", "Event name:"],
    ["Ereignisname", "Event name"],
    ["Antwort: Keine Daten", "Response: No data"],
    ["Antwort:", "Response:"],
    ["Keine Daten", "No data"],
    ["CAB-ID:", "CAB ID:"],
    ["CAB-ID", "CAB ID"],
    ["Problemsignatur:", "Problem signature:"],
    ["Problemsignatur", "Problem signature"],
    ["Angefügte Dateien:", "Attached files:"],
    ["Angefügte Dateien", "Attached files"],
    ["Diese Dateien sind hier zu finden:", "These files can be found here:"],
    ["Analysesymbol:", "Analysis symbol:"],
    ["Analysesymbol", "Analysis symbol"],
    ["Erneute Suche nach Lösungen:", "Searching for solutions:"],
    ["Gehashter Container:", "Hashed container:"],
    ["Gehashter Container", "Hashed container"],
    ["Berichtskennung:", "Report identifier:"],
    ["Berichtskennung", "Report identifier"],
    ["Berichtstatus:", "Report state:"],
    ["Berichtstatus", "Report state"],
    [", Typ ", ", type "],
    ["\nTyp ", "\ntype "],
    ["x64-basierter PC", "x64-based PC"],
    ["x86-basierter PC", "x86-based PC"],
    ["ARM64-basierter PC", "ARM64-based PC"],
    ["Installierter physischer Arbeitsspeicher (RAM)", "Installed Physical Memory (RAM)"],
    ["Installierter physischer Arbeitsspeicher", "Installed Physical Memory"],
    ["Gesamter physischer Arbeitsspeicher", "Total Physical Memory"],
    ["Verfügbarer physischer Arbeitsspeicher", "Available Physical Memory"],
    ["Gesamter virtueller Arbeitsspeicher", "Total Virtual Memory"],
    ["Verfügbarer virtueller Arbeitsspeicher", "Available Virtual Memory"],
    ["Auslagerungsdatei", "Page File"],
    ["Auslagerungsdateigröße", "Page File Space"],
    ["Speicher für Auslagerungsdateien", "Page File Location(s)"],
    ["Dateisystem", "File System"],
    ["Gesamtgröße", "Total Size"],
    ["Freier Speicher", "Free Space"],
    ["Belegter Speicher", "Used"],
    ["Volumename", "Volume Name"],
    ["Hersteller", "Manufacturer"],
    ["Lokaler Datenträger", "Local Disk"],
    ["Lokales Festplattenlaufwerk", "Local Fixed Disk"],
    ["Netzlaufwerk", "Network drive"],
    ["Wechseldatenträger", "Removable device"],
    ["DVD-Laufwerk", "Optical drive"],
    ["Wird ausgeführt", "Running"],
    ["Beendet", "Stopped"],
    ["Deaktiviert", "Disabled"],
    ["Automatisch", "Automatic"],
    ["Manuell", "Manual"],
    ["Nicht verfügbar", "Unavailable"],
    ["Ja", "Yes"],
    ["Nein", "No"],
    ["NVIDIA-kompatibel", "NVIDIA-compatible"],
    ["Direct3D-kompatibel", "Direct3D-compatible"],
    ["integrierter Grafikadapter", "Integrated video adapter"],
    ["Primärer Bildschirm", "Primary display"],
    ["GB", "GB"],
    ["TB", "TB"],
    ["MB", "MB"],
    ["kB", "KB"],
    ["Bytes", "bytes"],
    ["Byte)", "bytes)"],
    ["\nByte ", "\nbytes "],
    // --- French (fr + fr-CA overlap) ---
    ["Environnement logiciel / Rapports d'erreurs Windows", "Software Environment / Windows Error Reporting"],
    ["Rapports d'erreurs Windows", "Windows Error Reporting"],
    ["Conteneur d'erreurs", "Error container"],
    ["Nom de l'événement:", "Event name:"],
    ["Nom de l'événement", "Event name"],
    ["Réponse : Aucune donnée", "Response: No data"],
    ["Réponse : aucune donnée", "Response: No data"],
    ["Réponse:", "Response:"],
    ["Aucune donnée", "No data"],
    ["ID CAB :", "CAB ID:"],
    ["ID CAB:", "CAB ID:"],
    ["Signature du problème :", "Problem signature:"],
    ["Signature du problème", "Problem signature"],
    ["Fichiers joints :", "Attached files:"],
    ["Fichiers joints", "Attached files"],
    ["Ces fichiers peuvent être disponibles ici :", "These files can be found here:"],
    ["Symbole d'analyse :", "Analysis symbol:"],
    ["Symbole d'analyse", "Analysis symbol"],
    ["Nouvelle recherche de solutions :", "Searching for solutions:"],
    ["Conteneur haché :", "Hashed container:"],
    ["Identificateur du rapport :", "Report identifier:"],
    ["État du rapport :", "Report state:"],
    [", type ", ", type "],
    ["Ordinateur à processeur x64", "x64-based PC"],
    ["Ordinateur à processeur x86", "x86-based PC"],
    ["Mémoire physique installée (RAM)", "Installed Physical Memory (RAM)"],
    ["Mémoire physique installée", "Installed Physical Memory"],
    ["Mémoire physique totale", "Total Physical Memory"],
    ["Mémoire physique disponible", "Available Physical Memory"],
    ["Mémoire virtuelle totale", "Total Virtual Memory"],
    ["Mémoire virtuelle disponible", "Available Virtual Memory"],
    ["Fichier d'échange", "Page File"],
    ["Système de fichiers", "File System"],
    ["Taille totale", "Total Size"],
    ["Espace libre", "Free Space"],
    ["Espace utilisé", "Used"],
    ["Nom du volume", "Volume Name"],
    ["Processeur", "Processor"],
    ["Fabricant", "Manufacturer"],
    ["Exécution", "Running"],
    ["Arrêté", "Stopped"],
    ["Désactivé", "Disabled"],
    ["Automatique", "Automatic"],
    ["Oui", "Yes"],
    ["Non", "No"],
    ["Indisponible", "Unavailable"],
    ["NVIDIA-compatible", "NVIDIA-compatible"],
    // --- Spanish (es) ---
    ["Entorno de software / Informes de errores de Windows", "Software Environment / Windows Error Reporting"],
    ["Informes de errores de Windows", "Windows Error Reporting"],
    ["Contenedor de errores", "Error container"],
    ["Nombre del evento:", "Event name:"],
    ["Nombre del evento", "Event name"],
    ["Respuesta: No hay datos", "Response: No data"],
    ["Respuesta:", "Response:"],
    ["No hay datos", "No data"],
    ["Id. de CAB:", "CAB ID:"],
    ["Firma del problema:", "Problem signature:"],
    ["Archivos adjuntos:", "Attached files:"],
    ["Estos archivos se pueden encontrar aquí:", "These files can be found here:"],
    ["Símbolo de análisis:", "Analysis symbol:"],
    ["Búsqueda de soluciones nueva:", "Searching for solutions:"],
    ["Contenedor con hash:", "Hashed container:"],
    ["Identificador de informe:", "Report identifier:"],
    ["Estado del informe:", "Report state:"],
    ["Equipo basado en x64", "x64-based PC"],
    ["Memoria física instalada (RAM)", "Installed Physical Memory (RAM)"],
    ["Memoria física instalada", "Installed Physical Memory"],
    ["Memoria física total", "Total Physical Memory"],
    ["Memoria física disponible", "Available Physical Memory"],
    ["Sistema de archivos", "File System"],
    ["Tamaño total", "Total Size"],
    ["Espacio libre", "Free Space"],
    ["Espacio usado", "Used"],
    ["Nombre de volumen", "Volume Name"],
    ["Fabricante", "Manufacturer"],
    ["Modelo", "Model"],
    ["En ejecución", "Running"],
    ["Detenido", "Stopped"],
    ["Deshabilitado", "Disabled"],
    ["Automático", "Automatic"],
    ["Manual", "Manual"],
    ["Sí", "Yes"],
    ["No disponible", "Unavailable"],
    // --- Italian (it) ---
    ["Ambiente software / Segnalazioni di problemi di Windows", "Software Environment / Windows Error Reporting"],
    ["Segnalazioni di problemi di Windows", "Windows Error Reporting"],
    ["Contenitore errori", "Error container"],
    ["Nome evento:", "Event name:"],
    ["Risposta: Nessun dato", "Response: No data"],
    ["Nessun dato", "No data"],
    ["Firma problema:", "Problem signature:"],
    ["File allegati:", "Attached files:"],
    ["Questi file potrebbero essere disponibili qui:", "These files can be found here:"],
    ["Simbolo analisi:", "Analysis symbol:"],
    ["Nuova ricerca soluzioni:", "Searching for solutions:"],
    ["Contenitore con hash:", "Hashed container:"],
    ["Computer basato su x64", "x64-based PC"],
    ["Memoria fisica installata (RAM)", "Installed Physical Memory (RAM)"],
    ["Memoria fisica installata", "Installed Physical Memory"],
    ["File system", "File System"],
    ["Dimensione totale", "Total Size"],
    ["Spazio libero", "Free Space"],
    ["Spazio utilizzato", "Used"],
    ["Nome volume", "Volume Name"],
    ["In esecuzione", "Running"],
    ["Arrestato", "Stopped"],
    ["Disabilitato", "Disabled"],
    ["Automatico", "Automatic"],
    ["Non disponibile", "Unavailable"],
    // --- Portuguese (pt / pt-BR) ---
    ["Ambiente de software / Relatórios de Erros do Windows", "Software Environment / Windows Error Reporting"],
    ["Relatórios de Erros do Windows", "Windows Error Reporting"],
    ["Contêiner de erros", "Error container"],
    ["Nome do evento:", "Event name:"],
    ["Resposta: Sem dados", "Response: No data"],
    ["Sem dados", "No data"],
    ["Assinatura do problema:", "Problem signature:"],
    ["Arquivos anexados:", "Attached files:"],
    ["Esses arquivos podem estar disponíveis aqui:", "These files can be found here:"],
    ["Símbolo de análise:", "Analysis symbol:"],
    ["Computador baseado em x64", "x64-based PC"],
    ["Memória física instalada (RAM)", "Installed Physical Memory (RAM)"],
    ["Memória física instalada", "Installed Physical Memory"],
    ["Sistema de ficheiros", "File System"],
    ["Sistema de archivos", "File System"],
    ["Tamanho total", "Total Size"],
    ["Espaço livre", "Free Space"],
    ["Espaço usado", "Used"],
    ["Nome do volume", "Volume Name"],
    ["Em execução", "Running"],
    ["Parado", "Stopped"],
    ["Desativado", "Disabled"],
    ["Desactivado", "Disabled"],
    ["Automático", "Automatic"],
    ["Sim", "Yes"],
    ["Não", "No"],
    // --- Polish (pl) ---
    ["Oprogramowanie / Zgłoszenia błędów systemu Windows", "Software Environment / Windows Error Reporting"],
    ["Zgłoszenia błędów systemu Windows", "Windows Error Reporting"],
    ["Kontener błędów", "Error container"],
    ["Nazwa zdarzenia:", "Event name:"],
    ["Odpowiedź: Brak danych", "Response: No data"],
    ["Brak danych", "No data"],
    ["Podpis problemu:", "Problem signature:"],
    ["Załączone pliki:", "Attached files:"],
    ["Te pliki mogą być dostępne tutaj:", "These files can be found here:"],
    ["Symbol analizy:", "Analysis symbol:"],
    ["Komputer z procesorem x64", "x64-based PC"],
    ["Zainstalowana pamięć fizyczna (RAM)", "Installed Physical Memory (RAM)"],
    ["Zainstalowana pamięć fizyczna", "Installed Physical Memory"],
    ["System plików", "File System"],
    ["Całkowity rozmiar", "Total Size"],
    ["Wolne miejsce", "Free Space"],
    ["Zajęte", "Used"],
    ["Nazwa woluminu", "Volume Name"],
    ["Uruchomiony", "Running"],
    ["Zatrzymany", "Stopped"],
    ["Wyłączony", "Disabled"],
    ["Automatyczny", "Automatic"],
    ["Ręczny", "Manual"],
    ["Tak", "Yes"],
    ["Nie", "No"],
    ["Niedostępne", "Unavailable"],
    // --- Czech (cs) ---
    ["Softwarové prostředí / Hlášení chyb systému Windows", "Software Environment / Windows Error Reporting"],
    ["Hlášení chyb systému Windows", "Windows Error Reporting"],
    ["Kontejner chyb", "Error container"],
    ["Název události:", "Event name:"],
    ["Odpověď: Žádná data", "Response: No data"],
    ["Žádná data", "No data"],
    ["Podpis problému:", "Problem signature:"],
    ["Připojené soubory:", "Attached files:"],
    ["Počítač založený na platformě x64", "x64-based PC"],
    ["Nainstalovaná fyzická paměť (RAM)", "Installed Physical Memory (RAM)"],
    ["Nainstalovaná fyzická paměť", "Installed Physical Memory"],
    ["Souborový systém", "File System"],
    ["Celková velikost", "Total Size"],
    ["Volné místo", "Free Space"],
    ["Spuštěno", "Running"],
    ["Zastaveno", "Stopped"],
    ["Zakázáno", "Disabled"],
    ["Automaticky", "Automatic"],
    ["Ručně", "Manual"],
    ["Ano", "Yes"],
    // --- Dutch (nl) ---
    ["Software-omgeving / Foutrapporten van Windows", "Software Environment / Windows Error Reporting"],
    ["Foutrapporten van Windows", "Windows Error Reporting"],
    ["Foutcontainer", "Error container"],
    ["Gebeurtenisnaam:", "Event name:"],
    ["Antwoord: Geen gegevens", "Response: No data"],
    ["Geen gegevens", "No data"],
    ["Probleemhandtekening:", "Problem signature:"],
    ["Bijgevoegde bestanden:", "Attached files:"],
    ["x64-gebaseerde pc", "x64-based PC"],
    ["Geïnstalleerd fysiek geheugen (RAM)", "Installed Physical Memory (RAM)"],
    ["Bestandssysteem", "File System"],
    ["Totale grootte", "Total Size"],
    ["Vrije ruimte", "Free Space"],
    ["Gebruikt", "Used"],
    ["Uitvoeren", "Running"],
    ["Gestopt", "Stopped"],
    ["Uitgeschakeld", "Disabled"],
    ["Automatisch", "Automatic"],
    ["Handmatig", "Manual"],
    ["Ja", "Yes"],
    ["Nee", "No"],
    ["Niet beschikbaar", "Unavailable"],
    // --- Danish (da) ---
    ["Softwaremiljø / Windows-fejlrapporter", "Software Environment / Windows Error Reporting"],
    ["Windows-fejlrapporter", "Windows Error Reporting"],
    ["Fejlbeholder", "Error container"],
    ["Hændelsesnavn:", "Event name:"],
    ["Svar: Ingen data", "Response: No data"],
    ["Ingen data", "No data"],
    ["Problemsignatur:", "Problem signature:"],
    ["Vedhæftede filer:", "Attached files:"],
    ["x64-baseret pc", "x64-based PC"],
    ["Installeret fysisk hukommelse (RAM)", "Installed Physical Memory (RAM)"],
    ["Filsystem", "File System"],
    ["Samlet størrelse", "Total Size"],
    ["Ledig plads", "Free Space"],
    ["Brugt", "Used"],
    ["Kører", "Running"],
    ["Stoppet", "Stopped"],
    ["Deaktiveret", "Disabled"],
    ["Automatisk", "Automatic"],
    ["Manuel", "Manual"],
    ["Ja", "Yes"],
    ["Nej", "No"],
    // --- Swedish (sv) ---
    ["Programvara / Windows-felrapporter", "Software Environment / Windows Error Reporting"],
    ["Windows-felrapporter", "Windows Error Reporting"],
    ["Felbehållare", "Error container"],
    ["Händelsenamn:", "Event name:"],
    ["Svar: Inga data", "Response: No data"],
    ["Inga data", "No data"],
    ["Problemsignatur:", "Problem signature:"],
    ["Bifogade filer:", "Attached files:"],
    ["x64-baserad dator", "x64-based PC"],
    ["Installerat fysiskt minne (RAM)", "Installed Physical Memory (RAM)"],
    ["Filsystem", "File System"],
    ["Total storlek", "Total Size"],
    ["Ledigt utrymme", "Free Space"],
    ["Använt", "Used"],
    ["Körs", "Running"],
    ["Stoppad", "Stopped"],
    ["Inaktiverad", "Disabled"],
    ["Automatisk", "Automatic"],
    ["Manuell", "Manual"],
    ["Ja", "Yes"],
    ["Nej", "No"],
    // --- Norwegian Bokmål (nb) ---
    ["Programvare / Windows-feilrapporter", "Software Environment / Windows Error Reporting"],
    ["Windows-feilrapporter", "Windows Error Reporting"],
    ["Feilbeholder", "Error container"],
    ["Hendelsesnavn:", "Event name:"],
    ["Svar: Ingen data", "Response: No data"],
    ["Ingen data", "No data"],
    ["Problemsignatur:", "Problem signature:"],
    ["Vedlegg:", "Attached files:"],
    ["x64-basert PC", "x64-based PC"],
    ["Installert fysisk minne (RAM)", "Installed Physical Memory (RAM)"],
    ["Filsystem", "File System"],
    ["Total størrelse", "Total Size"],
    ["Ledig plass", "Free Space"],
    ["Brukt", "Used"],
    ["Kjører", "Running"],
    ["Stoppet", "Stopped"],
    ["Deaktivert", "Disabled"],
    ["Automatisk", "Automatic"],
    ["Manuell", "Manual"],
    ["Ja", "Yes"],
    ["Nei", "No"],
    // --- Finnish (fi) ---
    ["Ohjelmisto / Windows-virheraportit", "Software Environment / Windows Error Reporting"],
    ["Windows-virheraportit", "Windows Error Reporting"],
    ["Virhesäiliö", "Error container"],
    ["Tapahtuman nimi:", "Event name:"],
    ["Vastaus: Ei tietoja", "Response: No data"],
    ["Ei tietoja", "No data"],
    ["Ongelmatunnus:", "Problem signature:"],
    ["Liitetyt tiedostot:", "Attached files:"],
    ["x64-pohjainen tietokone", "x64-based PC"],
    ["Asennettu fyysinen muisti (RAM)", "Installed Physical Memory (RAM)"],
    ["Tiedostojärjestelmä", "File System"],
    ["Kokonaiskoko", "Total Size"],
    ["Vapaa tila", "Free Space"],
    ["Käytetty", "Used"],
    ["Käynnissä", "Running"],
    ["Pysäytetty", "Stopped"],
    ["Poistettu käytöstä", "Disabled"],
    ["Automaattinen", "Automatic"],
    ["Manuaalinen", "Manual"],
    ["Kyllä", "Yes"],
    ["Ei", "No"],
    ["Ei käytettävissä", "Unavailable"],
    // --- Estonian (et) ---
    ["Tarkvara / Windowsi veaaruanded", "Software Environment / Windows Error Reporting"],
    ["Windowsi veaaruanded", "Windows Error Reporting"],
    ["Veaümbris", "Error container"],
    ["Sündmuse nimi:", "Event name:"],
    ["Vastus: Andmed puuduvad", "Response: No data"],
    ["Andmed puuduvad", "No data"],
    ["Probleemi allkiri:", "Problem signature:"],
    ["Manustatud failid:", "Attached files:"],
    ["x64-põhine arvuti", "x64-based PC"],
    ["Installitud füüsiline mälu (RAM)", "Installed Physical Memory (RAM)"],
    ["Failisüsteem", "File System"],
    ["Kogumaht", "Total Size"],
    ["Vaba ruum", "Free Space"],
    ["Kasutusel", "Used"],
    ["Käivitatud", "Running"],
    ["Peatatud", "Stopped"],
    ["Keelatud", "Disabled"],
    ["Automaatne", "Automatic"],
    ["Käsitsi", "Manual"],
    ["Jah", "Yes"],
    ["Ei", "No"],
    // --- Romanian (ro) ---
    ["Software / Rapoarte de probleme Windows", "Software Environment / Windows Error Reporting"],
    ["Rapoarte de probleme Windows", "Windows Error Reporting"],
    ["Recipient de erori", "Error container"],
    ["Nume eveniment:", "Event name:"],
    ["Răspuns: Fără date", "Response: No data"],
    ["Fără date", "No data"],
    ["Semnătura problemei:", "Problem signature:"],
    ["Fișiere atașate:", "Attached files:"],
    ["Computer bazat pe x64", "x64-based PC"],
    ["Memorie fizică instalată (RAM)", "Installed Physical Memory (RAM)"],
    ["Sistem de fișiere", "File System"],
    ["Dimensiune totală", "Total Size"],
    ["Spațiu liber", "Free Space"],
    ["Utilizat", "Used"],
    ["Rulare", "Running"],
    ["Oprit", "Stopped"],
    ["Dezactivat", "Disabled"],
    ["Automat", "Automatic"],
    ["Da", "Yes"],
    ["Nu", "No"],
    ["Indisponibil", "Unavailable"],
    // --- Hungarian (hu) ---
    ["Szoftverkörnyezet / Windows-hibajelentések", "Software Environment / Windows Error Reporting"],
    ["Windows-hibajelentések", "Windows Error Reporting"],
    ["Hibatároló", "Error container"],
    ["Esemény neve:", "Event name:"],
    ["Válasz: Nincsenek adatok", "Response: No data"],
    ["Nincsenek adatok", "No data"],
    ["Probléma aláírása:", "Problem signature:"],
    ["Csatolt fájlok:", "Attached files:"],
    ["x64-alapú számítógép", "x64-based PC"],
    ["Telepített fizikai memória (RAM)", "Installed Physical Memory (RAM)"],
    ["Fájlrendszer", "File System"],
    ["Teljes méret", "Total Size"],
    ["Szabad hely", "Free Space"],
    ["Használt", "Used"],
    ["Fut", "Running"],
    ["Leállítva", "Stopped"],
    ["Letiltva", "Disabled"],
    ["Automatikus", "Automatic"],
    ["Kézi", "Manual"],
    ["Igen", "Yes"],
    ["Nem", "No"],
    ["Nem érhető el", "Unavailable"],
    // --- Turkish (tr) ---
    ["Yazılım Ortamı / Windows Hata Bildirimleri", "Software Environment / Windows Error Reporting"],
    ["Windows Hata Bildirimleri", "Windows Error Reporting"],
    ["Hata kapsayıcısı", "Error container"],
    ["Olay Adı:", "Event name:"],
    ["Yanıt: Veri yok", "Response: No data"],
    ["Veri yok", "No data"],
    ["Sorun İmzası:", "Problem signature:"],
    ["Ekli Dosyalar:", "Attached files:"],
    ["x64 tabanlı bilgisayar", "x64-based PC"],
    ["Yüklü Fiziksel Bellek (RAM)", "Installed Physical Memory (RAM)"],
    ["Dosya sistemi", "File System"],
    ["Toplam boyut", "Total Size"],
    ["Boş alan", "Free Space"],
    ["Kullanılan", "Used"],
    ["Çalışıyor", "Running"],
    ["Durduruldu", "Stopped"],
    ["Devre Dışı", "Disabled"],
    ["Otomatik", "Automatic"],
    ["Elle", "Manual"],
    ["Evet", "Yes"],
    ["Hayır", "No"],
    ["Kullanılamıyor", "Unavailable"],
    // --- Greek (el) ---
    ["Λογισμικό / Αναφορές σφαλμάτων των Windows", "Software Environment / Windows Error Reporting"],
    ["Αναφορές σφαλμάτων των Windows", "Windows Error Reporting"],
    ["Υποδοχέας σφαλμάτων", "Error container"],
    ["Όνομα συμβάντος:", "Event name:"],
    ["Απόκριση: Δεν υπάρχουν δεδομένα", "Response: No data"],
    ["Υπογραφή προβλήματος:", "Problem signature:"],
    ["Συνημμένα αρχεία:", "Attached files:"],
    ["Υπολογιστής τύπου x64", "x64-based PC"],
    ["Εγκατεστημένη φυσική μνήμη (RAM)", "Installed Physical Memory (RAM)"],
    ["Σύστημα αρχείων", "File System"],
    ["Συνολικό μέγεθος", "Total Size"],
    ["Ελεύθερος χώρος", "Free Space"],
    ["Χρησιμοποιείται", "Used"],
    ["Εκτέλεση", "Running"],
    ["Διακοπή", "Stopped"],
    ["Απενεργοποιημένο", "Disabled"],
    ["Αυτόματο", "Automatic"],
    ["Χειροκίνητο", "Manual"],
    ["Ναι", "Yes"],
    ["Όχι", "No"],
    // --- Arabic (ar) ---
    ["مايكروسوفت", "Microsoft"],
    ["البناء", "Build"],
    ["الذاكرة الفعلية المثبتة", "Installed Physical Memory"],
    ["إجمالي الذاكرة الفعلية", "Total Physical Memory"],
    ["الذاكرة الفعلية المتوفرة", "Available Physical Memory"],
    ["نظام الملفات", "File System"],
    ["الحجم الإجمالي", "Total Size"],
    ["المساحة الحرة", "Free Space"],
    ["المستخدم", "Used"],
    ["المعالج", "Processor"],
    ["الشركة المصنعة", "Manufacturer"],
    ["النموذج", "Model"],
    ["نعم", "Yes"],
    ["لا", "No"],
    ["غير متوفر", "Unavailable"],
    // --- Chinese Simplified (zh-Hans) ---
    ["软件环境 / Windows 错误报告", "Software Environment / Windows Error Reporting"],
    ["Windows 错误报告", "Windows Error Reporting"],
    ["错误容器", "Error container"],
    ["事件名称:", "Event name:"],
    ["响应: 无数据", "Response: No data"],
    ["无数据", "No data"],
    ["问题签名:", "Problem signature:"],
    ["附加文件:", "Attached files:"],
    ["基于 x64 的电脑", "x64-based PC"],
    ["已安装的物理内存 (RAM)", "Installed Physical Memory (RAM)"],
    ["已安装的物理内存", "Installed Physical Memory"],
    ["文件系统", "File System"],
    ["总大小", "Total Size"],
    ["可用空间", "Free Space"],
    ["已用空间", "Used"],
    ["卷名", "Volume Name"],
    ["正在运行", "Running"],
    ["已停止", "Stopped"],
    ["已禁用", "Disabled"],
    ["自动", "Automatic"],
    ["手动", "Manual"],
    // --- Chinese Traditional (zh-Hant) ---
    ["軟體環境 / Windows 錯誤報告", "Software Environment / Windows Error Reporting"],
    ["Windows 錯誤報告", "Windows Error Reporting"],
    ["錯誤容器", "Error container"],
    ["事件名稱:", "Event name:"],
    ["回應: 沒有資料", "Response: No data"],
    ["沒有資料", "No data"],
    ["問題簽章:", "Problem signature:"],
    ["附加檔案:", "Attached files:"],
    ["以 x64 為基礎的電腦", "x64-based PC"],
    ["已安裝的實體記憶體 (RAM)", "Installed Physical Memory (RAM)"],
    ["已安裝的實體記憶體", "Installed Physical Memory"],
    ["檔案系統", "File System"],
    ["總大小", "Total Size"],
    ["可用空間", "Free Space"],
    ["已使用的空間", "Used"],
    ["磁碟區標籤", "Volume Name"],
    // --- Japanese (ja) ---
    ["ソフトウェア環境 / Windows エラー報告", "Software Environment / Windows Error Reporting"],
    ["Windows エラー報告", "Windows Error Reporting"],
    ["エラー コンテナー", "Error container"],
    ["イベント名:", "Event name:"],
    ["応答: データがありません", "Response: No data"],
    ["データがありません", "No data"],
    ["問題の署名:", "Problem signature:"],
    ["添付ファイル:", "Attached files:"],
    ["x64-ベース PC", "x64-based PC"],
    ["x64 ベース PC", "x64-based PC"],
    ["x86-ベース PC", "x86-based PC"],
    ["x86 ベース PC", "x86-based PC"],
    ["ARM64-ベース PC", "ARM64-based PC"],
    ["ARM64 ベース PC", "ARM64-based PC"],
    ["プロセッサ ドライバー", "Processor driver"],
    ["カーネル ドライバー", "Kernel driver"],
    ["カーネル ドライバ", "Kernel driver"],
    ["手動停止 OK", "Manual stop OK"],
    ["手動停止", "Manual stop"],
    ["インストール済みの物理メモリ (RAM)", "Installed Physical Memory (RAM)"],
    ["インストール済み物理メモリ (RAM)", "Installed Physical Memory (RAM)"],
    ["合計の物理メモリ", "Total Physical Memory"],
    ["利用可能な物理メモリ", "Available Physical Memory"],
    ["合計の仮想メモリ", "Total Virtual Memory"],
    ["利用可能な仮想メモリ", "Available Virtual Memory"],
    ["ページ ファイルのサイズ", "Page File Space"],
    ["ページング ファイルのサイズ", "Paging File Space"],
    ["ページ ファイルの場所", "Page File Location(s)"],
    ["ページング ファイルの場所", "Page File Location(s)"],
    ["プラットフォームの役割", "Platform Role"],
    ["タイム ゾーン", "Time Zone"],
    ["タイムゾーン", "Time Zone"],
    ["デスクトップ", "Desktop"],
    ["モバイル", "Mobile"],
    ["タブレット", "Tablet"],
    ["ノート PC", "Laptop"],
    ["ノートパソコン", "Laptop"],
    ["ワークステーション", "Workstation"],
    ["サーバー", "Server"],
    ["マルチセッション限定", "Multi-session limited"],
    ["東京 (標準時)", "Tokyo (Standard Time)"],
    ["大阪、札幌、東京 (標準時)", "Osaka, Sapporo, Tokyo (Standard Time)"],
    ["標準時", "Standard Time"],
    ["夏時間", "Daylight Time"],
    ["個のロジカル プロセッサ", " logical processors"],
    ["個のコア", " cores"],
    ["ロジカル プロセッサ", "logical processors"],
    ["ファイル システム", "File System"],
    ["物理ディスク", "Physical disk"],
    ["固定ディスク", "Fixed disk"],
    ["ハード ディスク", "Hard disk"],
    ["ハードディスク", "Hard disk"],
    ["ローカル ディスク", "Local Disk"],
    ["ローカルディスク", "Local Disk"],
    ["テラバイト", "TB"],
    ["ギガバイト", "GB"],
    ["メガバイト", "MB"],
    ["キロバイト", "KB"],
    ["バイト/セクター", "bytes per sector"],
    ["バイト／セクター", "bytes per sector"],
    ["ディスク", "Disk"],
    ["総容量", "Total Size"],
    ["空き容量", "Free Space"],
    ["使用中の容量", "Space in use"],
    ["使用済みの容量", "Space in use"],
    ["使用可能な容量", "Available space"],
    ["使用中", "Used"],
    ["実行中のサービス", "Running Services"],
    ["起動しているサービス", "Running Services"],
    ["共有プロセス", "Shared process"],
    ["個別プロセス", "Own process"],
    ["ローカル システム", "Local System"],
    ["ローカルシステム", "Local System"],
    ["ローカル サービス", "Local Service"],
    ["ローカルサービス", "Local Service"],
    ["ネットワーク サービス", "Network Service"],
    ["ネットワークサービス", "Network Service"],
    ["ビルド", "Build"],
    ["起動モード", "Startup mode"],
    ["起動の種類", "Startup type"],
    ["現在の状態", "Current state"],
    ["一時停止", "Paused"],
    ["開始待ち", "Start pending"],
    ["停止済み", "Stopped"],
    ["実行中", "Running"],
    ["停止", "Stopped"],
    ["無効", "Disabled"],
    ["自動", "Automatic"],
    ["手動", "Manual"],
    ["はい", "Yes"],
    ["いいえ", "No"],
    // --- Japanese: network adapter / IP (MSInfo Components → Network) ---
    ["DHCP リースの有効期限", "DHCP lease expires"],
    ["DHCP リース取得", "DHCP lease obtained"],
    ["接続固有の DNS サフィックス", "Connection-specific DNS suffix"],
    ["既定の IP ゲートウェイ", "Default IP gateway"],
    ["ネットワーク接続名", "Network connection name"],
    ["メモリ アドレス", "Memory address"],
    ["IRQ チャネル", "IRQ channel"],
    ["アダプターの種類", "Adapter type"],
    ["アダプター種類", "Adapter type"],
    ["製品の種類", "Product type"],
    ["インストール済み", "Installed"],
    ["最終リセット", "Last reset"],
    ["インデックス", "Index"],
    ["サービス名", "Service name"],
    ["IP アドレス", "IP address"],
    ["IP サブネット", "IP subnet"],
    ["I/O ポート", "I/O port"],
    ["メディアの状態", "Media state"],
    ["接続の速度", "Connection speed"],
    ["接続名", "Connection name"],
    ["イーサネット 802.3", "Ethernet 802.3"],
    ["イーサネット802.3", "Ethernet 802.3"],
    ["ワイヤレス 802.11", "Wireless 802.11"],
    ["ワイヤレス802.11", "Wireless 802.11"],
    ["システム ドライブ", "System drive"],
    ["システムドライブ", "System drive"],
    ["起動ドライブ", "Boot drive"],
    ["ドライバー", "Driver"],
    ["ドライバ", "Driver"],
    ["ドライブ", "Driver"],
    ["表示ドライバー", "Display driver"],
    ["共有システム メモリ", "Shared system memory"],
    ["共有システムメモリ", "Shared system memory"],
    ["カラー深度", "Color depth"],
    ["リフレッシュ レート", "Refresh rate"],
    ["リフレッシュレート", "Refresh rate"],
    ["解像度の詳細", "Resolution details"],
    ["現在の解像度", "Current resolution"],
    ["PNP デバイス ID", "PNP Device ID"],
    ["DHCP サーバー", "DHCP Server"],
    ["DHCPサーバー", "DHCP Server"],
    ["DHCP を有効にする", "DHCP enabled"],
    ["DHCP 有効", "DHCP enabled"],
    ["物理アドレス", "Physical address"],
    ["MAC アドレス", "MAC address"],
    ["MACアドレス", "MAC address"],
    ["IPv4 アドレス", "IPv4 address"],
    ["IPv4アドレス", "IPv4 address"],
    ["IPv6 アドレス", "IPv6 address"],
    ["IPv6アドレス", "IPv6 address"],
    ["IPv6 デフォルト ゲートウェイ", "IPv6 default gateway"],
    ["DNS サーバー", "DNS server"],
    ["DNSサーバー", "DNS server"],
    ["優先 DNS サーバー", "Preferred DNS server"],
    ["代替 DNS サーバー", "Alternate DNS server"],
    ["プライマリ DNS サーバー", "Primary DNS server"],
    ["セカンダリ DNS サーバー", "Secondary DNS server"],
    ["DNS サフィックス", "DNS suffix"],
    ["アダプター RAM", "Adapter RAM"],
    ["アダプタ RAM", "Adapter RAM"],
    ["アダプターの RAM", "Adapter RAM"],
    ["利用できません", "Not available"],
    ["利用可能", "Available"],
    // --- Japanese: Windows Error Reporting fault strings (Additional Information / Details body) ---
    ["Faulting パッケージ相対アプリケーション ID", "Faulting package-relative application ID"],
    ["Faulting パッケージの完全名", "Faulting package full name"],
    ["障害が発生しているアプリケーション名", "Faulting application name"],
    ["障害が発生したモジュール名", "Faulting module name"],
    ["アプリケーションのフォールトの開始時刻", "Faulting application start time"],
    ["アプリケーションのフォルトの開始時刻", "Faulting application start time"],
    ["Faulting アプリケーション パス", "Faulting application path"],
    ["Faulting モジュール パス", "Faulting module path"],
    ["フォールト プロセス ID", "Faulting process id"],
    ["フォルト プロセス ID", "Faulting process id"],
    ["フォールト オフセット", "Fault offset"],
    ["フォルト オフセット", "Fault offset"],
    ["例外コード", "Exception code"],
    ["タイム スタンプ", "Time stamp"],
    ["タイムスタンプ", "Time stamp"],
    ["バージョン:", "Version:"],
    ["バージョン：", "Version:"],
    ["モジュール バージョン", "Module version"],
    ["モジュールバージョン", "Module version"],
    ["レポートの種類", "Report type"],
    ["レポートの状態", "Report status"],
    ["追加情報", "Additional information"],
    ["詳細情報", "Detailed information"],
    // --- Korean (ko) ---
    ["소프트웨어 환경 / Windows 오류 보고", "Software Environment / Windows Error Reporting"],
    ["Windows 오류 보고", "Windows Error Reporting"],
    ["오류 컨테이너", "Error container"],
    ["이벤트 이름:", "Event name:"],
    ["응답: 데이터 없음", "Response: No data"],
    ["데이터 없음", "No data"],
    ["문제 서명:", "Problem signature:"],
    ["첨부 파일:", "Attached files:"],
    ["x64 기반 PC", "x64-based PC"],
    ["설치된 실제 RAM", "Installed Physical Memory (RAM)"],
    ["설치된 실제 메모리", "Installed Physical Memory"],
    ["파일 시스템", "File System"],
    ["총 크기", "Total Size"],
    ["여유 공간", "Free Space"],
    ["사용됨", "Used"],
    ["실행 중", "Running"],
    ["중지됨", "Stopped"],
    ["사용 안 함", "Disabled"],
    ["자동", "Automatic"],
    ["수동", "Manual"],
    ["예", "Yes"],
    ["아니요", "No"],
    ["사용할 수 없음", "Unavailable"],
  ];

  const MSINFO_I18N_EN_TOKEN_PAIRS = Object.freeze(
    /** @type {readonly (readonly [string, string])[]} */ (
      [...LOCALE_PAIRS_MSINFO_RU, ...LOCALE_PAIRS_MSINFO_INTL].sort((a, b) => b[0].length - a[0].length)
    )
  );

  /**
   * Decode numeric HTML character references (e.g. &#x969c;) so CJK in some MSInfo/WER exports is visible
   * to locale detection and phrase replacement (otherwise the string can look ASCII-only).
   * @param {string} s
   */
  function decodeMsinfoNumericHtmlEntities(s) {
    return String(s ?? "")
      .replace(/&#x([0-9a-fA-F]{1,6});/gi, (_, h) => {
        const cp = parseInt(h, 16);
        if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return "";
        try {
          return String.fromCodePoint(cp);
        } catch {
          return "";
        }
      })
      .replace(/&#(\d{1,7});/g, (_, d) => {
        const cp = parseInt(d, 10);
        if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return "";
        try {
          return String.fromCodePoint(cp);
        } catch {
          return "";
        }
      });
  }

  /** Decode common MSInfo / WER HTML-style line breaks so Russian tokens match across “&#x000d;&#x000a;”. */
  function normalizeMsinfoLineBreakEntities(s) {
    return decodeMsinfoNumericHtmlEntities(String(s ?? ""))
      .replace(/&#x000d;&#x000a;/gi, "\n")
      .replace(/&#000d;&#000a;/gi, "\n")
      .replace(/&#13;&#10;/gi, "\n")
      .replace(/&#xd;&#xa;/gi, "\n")
      .replace(/&#x000d;/gi, "\n")
      .replace(/&#x000a;/gi, "\n")
      .replace(/&#13;/gi, "\n")
      .replace(/&#10;/gi, "\n")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n");
  }

  /** @param {string} s */
  function translateMsinfoI18nTokensToEnglish(s) {
    let out = normalizeMsinfoLineBreakEntities(String(s ?? ""));
    /** JP volume lines use 「ドライブ C:」; do not let the standalone 「ドライブ」→「Driver」 pair corrupt those. */
    out = out.replace(/ドライブ\s*([A-Z])[：:]/gi, "Drive $1:");
    for (const pair of MSINFO_I18N_EN_TOKEN_PAIRS) {
      const from = pair[0];
      const to = pair[1];
      if (!from || out.indexOf(from) === -1) continue;
      out = out.split(from).join(to);
    }
    /** Spacing in MSInfo text exports varies; apply regex fallbacks after phrase table. */
    out = out
      .replace(/プロセッサ\s+ドライバー/g, "Processor driver")
      .replace(/カーネル\s+ドライバー?/g, "Kernel driver")
      .replace(/手動停止\s*OK/gi, "Manual stop OK")
      .replace(/x64\s*[-–]\s*ベース\s*PC/gi, "x64-based PC")
      .replace(/x86\s*[-–]\s*ベース\s*PC/gi, "x86-based PC")
      .replace(/共有プロセス/g, "Shared process")
      .replace(/個別プロセス/g, "Own process")
      .replace(/起動モード/g, "Startup mode")
      .replace(/システムが生成/g, "System generated")
      .replace(/システムにより開始/g, "System started")
      .replace(/\s*個のロジカル\s*プロセッサ/g, " logical processors")
      .replace(/\s*個のコア/g, " cores")
      .replace(/([\d,]+)\s+バイト/g, "$1 bytes")
      .replace(/([\d,]+)バイト(?=[\s),]|$)/g, "$1 bytes")
      .replace(/\)\s*バイト/g, ") bytes")
      .replace(/\uff09\s*バイト/g, ") bytes")
      .replace(/\s+ヘルツ/g, " Hz")
      .replace(/(\d)\s*ヘルツ/g, "$1 Hz")
      .replace(/(\d+)\s*ビット/g, "$1-bit")
      .replace(/、/g, ", ")
      .replace(/\bMhz\b/gi, "MHz");
    return out;
  }

  /** @param {string} raw */
  function translateExportValueToEnglish(raw) {
    const s = String(raw || "");
    const dev = translateMsProblemDeviceForDisplay(s);
    const base = dev.display !== dev.original ? dev.display : s;
    return translateMsinfoI18nTokensToEnglish(base);
  }

  /**
   * Wraps export-sourced values so section-level Translate can swap to offline English where mapped.
   * @param {string | null | undefined} raw full export string (stored on data-i18n-enc / data-export)
   * @param {(s: string) => string} escFn
   * @param {string | null | undefined} [displayOverride] visible text when different from raw (e.g. WER preview truncation)
   */
  function sumI18nSpan(raw, escFn, displayOverride) {
    const s = String(raw ?? "").trim();
    if (!s) return escFn("—");
    const inner = displayOverride != null ? String(displayOverride) : s;
    const innerShown = normalizeMsinfoLineBreakEntities(inner);
    if (!localeScriptLooksNonEnglishListed(normalizeMsinfoLineBreakEntities(s))) return escFn(innerShown);
    let enc = "";
    try {
      enc = encodeURIComponent(s);
    } catch {
      enc = "";
    }
    const encAttr = enc ? ` data-i18n-enc="${enc}"` : "";
    return `<span class="sum-i18n"${encAttr} data-export="${escFn(s)}">${escFn(innerShown)}</span>`;
  }

  /**
   * Collapsible report block — same chrome as Problem Devices (green bar, icon, count, chevron).
   * @param {string} title
   * @param {string} bodyHtml inner HTML only
   * @param {(s: string) => string} esc
   * @param {{ count?: number | null, open?: boolean, icon?: string, variant?: "default" | "alert" }} [opts]
   */
  function renderReportCategoryAccordion(title, bodyHtml, esc, opts) {
    const o = opts || {};
    const count = o.count != null && o.count > 0 ? Number(o.count) : null;
    const openAttr = o.open ? " open" : "";
    const icon = reportCategoryIconSvg(o.icon || "system");
    const mod = o.variant === "alert" ? " report-category--alert" : "";
    const countHtml =
      count != null
        ? `<span class="report-category__count" aria-label="${count} item(s)">${esc(String(count))}</span>`
        : "";
    const plainForDetect = decodeMsinfoNumericHtmlEntities(bodyHtml.replace(/<[^>]+>/g, " ")).replace(
      /&[a-zA-Z]+;/g,
      " "
    );
    const needsTranslate = localeScriptLooksNonEnglishListed(plainForDetect);
    const translateBtn = needsTranslate
      ? `<button type="button" class="report-category__translate" aria-pressed="false">Translate</button>`
      : "";
    return `<section class="report-category summary-card summary-card--wide${mod}" aria-label="${esc(title)}">
      <details class="report-category__details"${openAttr}>
        <summary class="report-category__summary">
          <span class="report-category__icon" aria-hidden="true">${icon}</span>
          <span class="report-category__summary-text">${esc(title)}</span>
          ${countHtml}
          ${translateBtn}
          <span class="report-category__chevron" aria-hidden="true"></span>
        </summary>
        <div class="report-category__body-inner"><div class="report-category__i18n-root">${bodyHtml}</div></div>
      </details>
    </section>`;
  }

  /**
   * Best-effort Russian (Cyrillic) → English for Problem Devices UI only (offline; no API).
   * Unknown strings pass through unchanged.
   * @param {string} raw
   * @returns {{ display: string, original: string }}
   */
  function translateMsProblemDeviceForDisplay(raw) {
    const original = String(raw || "").trim();
    if (!original) return { display: "", original: "" };
    if (!/[\u0400-\u04FF]/.test(original)) return { display: original, original };
    const norm = original.replace(/\s+/g, " ");
    /** @type {Record<string, string>} */
    const exact = {
      "Высокоточный таймер событий": "High Precision Event Timer",
      "Стандартная клавиатура PS/2": "Standard PS/2 Keyboard",
      "Мышь Microsoft PS/2": "Microsoft PS/2 Mouse",
      "Аудио устройства USB": "USB Audio Device",
      "Аудио устройство USB": "USB Audio Device",
      "Это устройство отключено.": "This device is disabled.",
      "Запуск этого устройства невозможен.": "This device cannot start.",
      "Драйверы для этого устройства не установлены.": "The drivers for this device are not installed.",
      "Система Windows останавливает это устройство.": "Windows is stopping this device.",
      "Не удается запустить это устройство.": "This device cannot start.",
    };
    if (exact[original]) return { display: exact[original], original };
    if (exact[norm]) return { display: exact[norm], original };
    const prefixRows = [
      {
        ru: "Это устройство отсутствует, работает неправильно, или для него установлены не все драйверы",
        en: "This device is not present, is not working properly, or does not have all the drivers installed.",
      },
      {
        ru: "Это устройство отсутствует, работает неправильно, или для него не установлены все драйверы",
        en: "This device is not present, is not working properly, or does not have all the drivers installed.",
      },
      {
        ru: "Это устройство настроено неправильно",
        en: "This device is not configured correctly.",
      },
      {
        ru: "Windows остановила это устройство, поскольку в нем возникли неполадки",
        en: "Windows has stopped this device because it has reported problems.",
      },
      {
        ru: "Для этого устройства найден конфликт ресурсов",
        en: "A conflict was detected for this device’s resources.",
      },
    ];
    for (const { ru, en } of prefixRows) {
      if (norm.startsWith(ru)) return { display: en, original };
    }
    return { display: original, original };
  }

  /**
   * Collapsible “Problem Devices” panel (details/summary for keyboard + screen readers).
   * @param { { device: string, vendor: string, detail: string }[] } problems
   * @param {(s: string) => string} esc
   */
  function renderProblemDevicesPanel(problems, esc) {
    const list = Array.isArray(problems) ? problems : [];
    const has = list.length > 0;

    const cardsHtml = list
      .map((p, i) => {
        const exportDeviceRaw = (p.device || "").trim();
        const exportDetailRaw = (p.detail || "").trim();
        const devicePrimary = sumI18nSpan(exportDeviceRaw || "Device", esc);
        const detailPrimary = sumI18nSpan(exportDetailRaw, esc);
        const vendor = esc((p.vendor || "").trim());
        const errorLine = exportDetailRaw
          ? detailPrimary
          : esc("Problem reported in MSInfo export (no additional code text in this row).");
        const vendorLine = vendor ? `<p class="problem-device-card__vendor"><em>Hardware ID: ${vendor}</em></p>` : "";

        return `<li class="problem-devices__item">
          <article class="problem-device-card" aria-labelledby="problem-device-title-${i}">
            <div class="problem-device-card__inner">
              <div class="problem-device-card__text">
                <h4 class="problem-device-card__title" id="problem-device-title-${i}">
                    <span class="problem-device-card__mark" aria-hidden="true"><svg viewBox="0 0 24 24" width="14" height="14" focusable="false"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg></span>
                    ${devicePrimary}
                  </h4>
                <p class="problem-device-card__error">${errorLine}</p>
                ${vendorLine}
              </div>
              <details class="problem-device-card__details">
                <summary class="problem-device-card__details-btn">
                  <span class="problem-device-card__play" aria-hidden="true"></span>
                  Show details
                </summary>
                <div class="problem-device-card__details-body">
                  <dl class="problem-device-card__dl">
                    <dt>Device</dt><dd>${sumI18nSpan(exportDeviceRaw || "Device", esc)}</dd>
                    ${vendor ? `<dt>Hardware ID</dt><dd>${vendor}</dd>` : ""}
                    ${exportDetailRaw ? `<dt>Details</dt><dd>${detailPrimary}</dd>` : "<dt>Details</dt><dd>—</dd>"}
                  </dl>
                </div>
              </details>
            </div>
          </article>
        </li>`;
      })
      .join("");

    const bodyInner = has
      ? `<div class="problem-devices__alert" role="status">
          <span class="problem-devices__alert-icon" aria-hidden="true"><svg class="problem-devices__warn-svg" viewBox="0 0 24 24" width="22" height="22" focusable="false"><path d="M12 4l9 16H3L12 4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 10v4M12 17h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span>
          <div>
            <strong class="problem-devices__alert-title">ATTENTION: Problem Devices Detected</strong>
            <p class="problem-devices__alert-sub">The following devices require immediate attention:</p>
          </div>
        </div>
        <ul class="problem-devices__list">${cardsHtml}</ul>`
      : `<p class="problem-devices__empty">No problem devices section or none listed in this export.</p>`;

    return renderReportCategoryAccordion(
      "Problem Devices",
      `<div class="problem-devices__body-inner">${bodyInner}</div>`,
      esc,
      {
        count: has ? list.length : null,
        icon: "warn",
        variant: "alert",
      }
    );
  }

  /**
   * Windows Updates dashboard (shown under OS Information).
   * @param {ReturnType<typeof extractSystemSummary>} sum
   * @param {(s: string) => string} esc
   */
  function renderWindowsUpdatesOsEmbed(sum, esc) {
    const os = sum.os || { name: "", versionLine: "", build: "", installDate: "" };
    const winTitle =
      os.name && os.versionLine
        ? `${os.name} — ${os.versionLine}`
        : os.versionLine || os.name || "Not found in this export";
    const buildRaw = (os.build || "").trim();
    let buildHero = "—";
    if (/^\d+$/.test(buildRaw)) buildHero = buildRaw;
    else {
      const tail = buildRaw.match(/(\d{5,})\s*$/);
      if (tail) buildHero = tail[1];
      else {
        const fromVer = `${os.versionLine || ""} ${buildRaw}`.match(/(\d{5,})/);
        if (fromVer) buildHero = fromVer[1];
        else if (buildRaw) buildHero = buildRaw;
      }
    }
    const syncSvg = `<svg class="os-winup__sync-svg" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0 0 20 12c0-4.42-3.58-8-8-8zm0 14v3l4-4-4-4v3c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 6.74A7.93 7.93 0 0 0 4 12c0 4.42 3.58 8 8 8z"/></svg>`;

    return `<div class="os-winup" aria-label="Windows Updates (from this export)">
      <div class="os-winup__header">
        <span class="os-winup__sync-badge" aria-hidden="true">${syncSvg}</span>
        <h4 class="os-winup__header-title">Windows Updates</h4>
      </div>
      <div class="os-winup__row">
        <div class="os-winup__card os-winup__card--build">
          <span class="os-winup__kicker">Current build</span>
          <p class="os-winup__hero">${sumI18nSpan(buildHero, esc)}</p>
          <p class="os-winup__sub">${sumI18nSpan(winTitle, esc)}</p>
        </div>
        <div class="os-winup__card os-winup__card--status">
          <span class="os-winup__kicker">Status</span>
          <p class="os-winup__status">Up to date</p>
          <p class="os-winup__status-note">Based on this MSInfo snapshot only — open Settings to verify pending updates.</p>
        </div>
      </div>
      <div class="os-winup__banner" role="status">
        <span class="os-winup__check" aria-hidden="true">&#10003;</span>
        <div>
          <strong class="os-winup__banner-title">Windows is up to date</strong>
          <p class="os-winup__banner-text">Your Windows installation appears to be current with the latest available build.</p>
          <p class="os-winup__banner-muted">This report does not query Windows Update live. Use <strong>Settings → Windows Update</strong> on the PC to confirm.</p>
        </div>
      </div>
      <a class="rec-btn rec-btn--primary rec-btn--block os-winup__cta" href="ms-settings:windowsupdate">Open Windows Update</a>
    </div>`;
  }

  /**
   * Motherboard + BIOS + vendor update actions (one System Information accordion).
   * @param {ReturnType<typeof extractSystemSummary>} sum
   * @param {(s: string) => string} esc
   */
  function renderMotherboardBiosBody(sum, esc) {
    const mb = sum.motherboard || {};
    const bm = sum.biosMeta || { ageDays: null, parsed: false };
    const links = motherboardSupportLinks(mb.manufacturer || "", mb.product || "");
    const biosFull =
      [sum.biosVersion, sum.biosDate].filter(Boolean).join(sum.biosVersion && sum.biosDate ? ", " : "") || "—";
    const parsedDate = tryParseBiosDate(String(sum.biosVersion || ""), String(sum.biosDate || ""));
    const man = (mb.manufacturer || "").trim();
    const prod = (mb.product || "").trim();
    const vendorName = man || "your OEM";
    const modelForBlurb = prod || "this system";
    const biosCheckMain = bm.parsed ? "Date parsed" : "Manual verification";
    const biosCheckFooter = man ? `Visit ${man} support` : "Visit OEM support center";
    const ageDetail =
      bm.parsed && bm.ageDays != null
        ? `${bm.ageDays.toLocaleString()} days since parsed BIOS date (coarse heuristic).`
        : "No reliable BIOS date parsed — confirm on the vendor site.";
    const biosStale = Boolean(bm.parsed && bm.ageDays != null && bm.ageDays > 400);
    const biosStrong = Boolean(bm.parsed && bm.ageDays != null && bm.ageDays > 730);
    const biosAlert = biosStale
      ? `<div class="rec-alert" role="status">
        <span class="rec-alert__icon" aria-hidden="true">&#9888;</span>
        <div>
          <strong>${biosStrong ? "BIOS is very old — prioritize vendor review" : "Older BIOS — check vendor advisories"}</strong>
          <p>Older firmware may miss security fixes and platform stability updates. Confirm exact board revision on the OEM download page before flashing.</p>
          <a class="rec-btn rec-btn--primary" href="https://msrc.microsoft.com/update-guide" target="_blank" rel="noopener noreferrer">Microsoft security update guide</a>
        </div>
      </div>`
      : "";

    let lastUpdatedBlock = "";
    if (parsedDate != null && bm.ageDays != null) {
      lastUpdatedBlock = `<p class="mbbios-last"><strong>Last updated</strong> (parsed from export): ${esc(
        parsedDate.toLocaleDateString(undefined, { dateStyle: "medium" })
      )} · <span class="mbbios-last__sub">about ${bm.ageDays.toLocaleString()} days ago</span></p>`;
    } else if (sum.biosDate) {
      lastUpdatedBlock = `<p class="mbbios-last"><strong>Date from export</strong> (not parsed to a single calendar day): ${sumI18nSpan(String(sum.biosDate), esc)}</p>`;
    } else {
      lastUpdatedBlock = `<p class="mbbios-last mbbios-last--muted">No separate BIOS release date in this export — check the vendor site for current firmware.</p>`;
    }

    return `<div class="mbbios">
      <div class="mbbios-info">
        <h4 class="mbbios-info__title"><span class="mbbios-info__glyph" aria-hidden="true">&#128203;</span> Motherboard information</h4>
        <dl class="mbbios-dl">
          <dt>Manufacturer</dt><dd>${sumI18nSpan(mb.manufacturer || "", esc)}</dd>
          <dt>Model</dt><dd>${sumI18nSpan(mb.product || "", esc)}</dd>
          ${mb.version ? `<dt>Version / serial</dt><dd>${sumI18nSpan(mb.version, esc)}</dd>` : ""}
          <dt>Current BIOS</dt><dd>${sumI18nSpan(biosFull, esc)}</dd>
        </dl>
      </div>
      <div class="mbbios-cards">
        <div class="mbbios-card mbbios-card--current">
          <span class="mbbios-card__kicker">Current BIOS</span>
          <p class="mbbios-card__value">${sumI18nSpan(biosFull, esc)}</p>
          <span class="mbbios-card__foot">Installed version</span>
        </div>
        <div class="mbbios-card mbbios-card--check">
          <span class="mbbios-card__kicker">Check required</span>
          <p class="mbbios-card__value">${esc(biosCheckMain)}</p>
          <p class="mbbios-card__detail">${esc(ageDetail)}</p>
          <a class="mbbios-card__foot mbbios-card__foot--link" href="${esc(links.supportUrl)}" target="_blank" rel="noopener noreferrer">${esc(
      biosCheckFooter
    )}</a>
        </div>
      </div>
      <div class="mbbios-update">
        <h4 class="mbbios-update__title"><span class="mbbios-update__glyph" aria-hidden="true">&#9432;</span> BIOS update check</h4>
        <p class="mbbios-update__copy">Check the <strong>${sumI18nSpan(vendorName, esc)}</strong> support site for the latest BIOS updates for your <strong>${sumI18nSpan(
      modelForBlurb,
      esc
    )}</strong>.</p>
        ${lastUpdatedBlock}
        <div class="rec-actions mbbios-actions">
          <a class="rec-btn rec-btn--primary" href="${esc(links.googleUrl)}" target="_blank" rel="noopener noreferrer">Check BIOS updates</a>
          <a class="rec-btn rec-btn--ghost" href="${esc(links.supportUrl)}" target="_blank" rel="noopener noreferrer">Support center</a>
        </div>
        ${biosAlert}
        <p class="rec-footnote">Important: BIOS update steps differ by product. Use only files from your motherboard or OEM vendor for your exact model and revision; incorrect images can make the system unbootable.</p>
      </div>
    </div>`;
  }

  /** @param {string} c */
  function werNormalizeCategory(c) {
    return c === "Hardware" ? "System" : c;
  }

  /** Minimal stroke icons (currentColor) — matches black / green system theme. */
  const WER_CATEGORY_ICONS = {
    All: `<svg class="wer-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
    Application: `<svg class="wer-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="14" rx="2"/><path d="M2 8h20"/></svg>`,
    Drivers: `<svg class="wer-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 1 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.77 3.77z"/></svg>`,
    System: `<svg class="wer-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>`,
    Network: `<svg class="wer-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>`,
    Security: `<svg class="wer-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/></svg>`,
    Services: `<svg class="wer-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="3" width="20" height="6" rx="1"/><rect x="2" y="15" width="20" height="6" rx="1"/><path d="M6 9v6M10 9v6"/></svg>`,
    Other: `<svg class="wer-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>`,
  };

  /** @param {string} cat */
  function werCategoryIconSvg(cat) {
    const c = werNormalizeCategory(cat);
    const k = /** @type {keyof typeof WER_CATEGORY_ICONS} */ (c);
    return WER_CATEGORY_ICONS[k] || WER_CATEGORY_ICONS.Other;
  }

  /**
   * @param {ReturnType<typeof extractWindowsErrorReports>} entries
   * @param {(s: string) => string} esc
   */
  function renderWindowsErrorReportsBody(entries, esc) {
    if (!entries || entries.length === 0) {
      return `<p class="summary-empty">No Windows Error Reporting / Problem Reports entries found in this export.</p>`;
    }
    const uid = `w${Math.random().toString(36).slice(2, 10)}`;
    const analysis = werAnalyze(entries);
    const cats = [...new Set(entries.map((e) => werNormalizeCategory(e.category)))].sort();
    const showTabs = cats.length > 1;

    const timeAgo = (/** @type {string} */ timeStr) => {
      if (!timeStr || timeStr === "Unknown time") return timeStr;
      const t = Date.parse(timeStr);
      if (Number.isNaN(t)) return timeStr;
      const diffMs = Date.now() - t;
      const diffDays = Math.floor(diffMs / 86400000);
      if (diffDays < 0) return timeStr;
      if (diffDays === 0) return "Today";
      if (diffDays === 1) return "Yesterday";
      if (diffDays < 7) return `${diffDays} days ago`;
      if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
      return `${Math.floor(diffDays / 30)} months ago`;
    };

    const dash = `<div class="wer-dashboard" aria-label="Error analysis summary">
      <h4 class="wer-dashboard__title">Error analysis summary</h4>
      <div class="wer-dashboard__stats">
        <div class="wer-stat"><span class="wer-stat__n">${entries.length}</span><span class="wer-stat__l">Total reports</span></div>
        <div class="wer-stat"><span class="wer-stat__n">${analysis.criticalCount}</span><span class="wer-stat__l">High severity</span></div>
        <div class="wer-stat"><span class="wer-stat__n">${analysis.uniqueTypes}</span><span class="wer-stat__l">Unique types</span></div>
        <div class="wer-stat"><span class="wer-stat__n">${analysis.timeSpan || "—"}</span><span class="wer-stat__l">Day range</span></div>
      </div>
    </div>`;

    const radios = showTabs
      ? `<input class="wer-sr-only" type="radio" name="wer-cat-${uid}" id="wer-${uid}-all" checked>
      ${cats
        .map(
          (c, i) =>
            `<input class="wer-sr-only" type="radio" name="wer-cat-${uid}" id="wer-${uid}-c${i}">`
        )
        .join("")}
      <div class="wer-cat-tabs" role="tablist" aria-label="Filter by category">
        <label class="wer-tab wer-tab--all" for="wer-${uid}-all"><span class="wer-tab__inner">${WER_CATEGORY_ICONS.All}<span class="wer-tab__txt">All</span></span></label>
        ${cats
          .map(
            (c, i) =>
              `<label class="wer-tab" for="wer-${uid}-c${i}"><span class="wer-tab__inner">${werCategoryIconSvg(c)}<span class="wer-tab__txt">${sumI18nSpan(c, esc)}</span></span></label>`
          )
          .join("")}
      </div>`
      : "";

    const timeline = entries
      .slice(0, 80)
      .map((e) => {
        const sevClass =
          e.severity === "error" ? "wer-item--error" : e.severity === "warning" ? "wer-item--warning" : "wer-item--info";
        const sevTitle =
          e.severity === "error" ? "High severity" : e.severity === "warning" ? "Warning" : "Informational";
        const prev =
          e.details.length > 140
            ? sumI18nSpan(e.details, esc, `${e.details.slice(0, 140)}…`)
            : sumI18nSpan(e.details, esc);
        const catKey = werNormalizeCategory(e.category);
        const cat = esc(catKey);
        return `<div class="wer-item ${sevClass}" data-wer-cat="${cat}">
        <div class="wer-item__marker" aria-hidden="true">${werCategoryIconSvg(catKey)}</div>
        <div class="wer-item__body">
          <div class="wer-item__head">
            <span class="wer-item__sev" title="${esc(sevTitle)}"><span class="wer-sev-dot wer-sev-dot--${e.severity}"></span></span>
            <span class="wer-item__type">${sumI18nSpan(e.type, esc)}</span>
            <span class="wer-item__when">${esc(timeAgo(e.time))}</span>
          </div>
          <div class="wer-item__meta"><span class="muted-label">Time</span> ${sumI18nSpan(e.time, esc)} · <span class="muted-label">Source</span> ${sumI18nSpan(
          e.sourceTitle,
          esc
        )}</div>
          <p class="wer-item__preview">${prev}</p>
          <details class="wer-details">
            <summary class="wer-details__sum">Show full details</summary>
            <pre class="wer-details__pre">${sumI18nSpan(e.details, esc)}</pre>
          </details>
        </div>
      </div>`;
      })
      .join("");

    const cssRules = showTabs
      ? cats
          .map((c, i) => {
            const id = `wer-${uid}-c${i}`;
            const escCat = c.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
            return `#${id}:checked ~ .wer-timeline .wer-item{display:none!important}#${id}:checked ~ .wer-timeline .wer-item[data-wer-cat="${escCat}"]{display:flex!important}`;
          })
          .concat([`#wer-${uid}-all:checked ~ .wer-timeline .wer-item{display:flex!important}`])
          .join("")
      : "";

    const styleBlock = showTabs ? `<style>#wer-root-${uid}{position:relative}${cssRules}</style>` : "";

    return `${dash}
<div class="wer-root" id="wer-root-${uid}">
  ${styleBlock}
  ${radios}
  <div class="wer-timeline" aria-label="Windows Error Reports, most recent first">
    ${timeline}
  </div>
  <p class="wer-footnote">Showing up to <strong>80</strong> of <strong>${entries.length}</strong> parsed report(s). Open the raw export to search the full file.</p>
</div>`;
  }

  /**
   * @param {HTMLElement} el
   * @param {ReturnType<typeof extractSystemSummary> | null} sum
   * @param {boolean} ok
   * @param {string[]=} repairNotes
   * @param {string[]=} msinfoXmlRepairs messages from {@link parseMsInfoDocument} in-memory XML repair
   */
  function renderSystemSummary(el, sum, ok, repairNotes, msinfoXmlRepairs) {
    el.innerHTML = "";
    const notes = Array.isArray(repairNotes) ? repairNotes : [];
    const xmlRep = Array.isArray(msinfoXmlRepairs) ? msinfoXmlRepairs : [];
    const xmlRepairBanner =
      ok && sum && xmlRep.length > 0
        ? `<div class="system-repair-note" role="status" style="font-size:0.85rem;line-height:1.45;color:var(--muted);background:rgba(118,185,0,0.1);border:1px solid rgba(118,185,0,0.28);border-radius:8px;padding:0.45rem 0.75rem;margin-bottom:0.75rem;">${esc(
            xmlRep.join(" ")
          )}</div>`
        : "";
    const recoveryBanner =
      notes.length > 0
        ? `<div class="summary-recovery" role="status"><strong class="summary-recovery__title">MSInfo recovery</strong><ul class="summary-recovery__list">${notes
            .map((x) => `<li>${esc(String(x))}</li>`)
            .join("")}</ul></div>`
        : "";
    if (!ok || !sum) {
      el.innerHTML =
        xmlRepairBanner +
        recoveryBanner +
        '<p class="summary-empty">Could not build a structured summary from this file. Open <strong>Raw export</strong> below, try a different encoding, export a fresh <code>.nfo</code> from msinfo32, or use <strong>Copy repaired XML</strong> if it appears after a partial fix.</p>';
      return;
    }

    const mbBiosBody = renderMotherboardBiosBody(sum, esc);
    const mbBiosHtml = renderReportCategoryAccordion("Motherboard & BIOS", mbBiosBody, esc, { icon: "mb" });

    const gpuCount = Array.isArray(sum.graphics?.adapters)
      ? sum.graphics.adapters.filter((a) => a && typeof a === "object" && hasGpuCardContent(/** @type {Record<string, unknown>} */ (a))).length
      : 0;
    const gpuDashboardEmbed = renderGpuDashboard(sum.graphics, esc, true);
    const problemDevicesHtml = renderProblemDevicesPanel(sum.problems, esc);

    let netBody = "";
    if (sum.networkAdapters && sum.networkAdapters.length) {
      netBody = `<p class="summary-lede">Shows adapters with a usable IPv4 and/or global IPv6, and either DNS resolvers in the file or a routable default gateway / DHCP server (MSInfo often omits DNS when DHCP provides it). Bluetooth and similar are omitted.</p><ul class="network-adapters">${sum.networkAdapters
        .map((a) => {
          const det = a.details
            .map(
              (d) =>
                `<div class="network-detail"><span class="network-detail__k">${sumI18nSpan(d.k, esc)}</span><span class="network-detail__v network-wrap">${sumI18nSpan(d.v, esc)}</span></div>`
            )
            .join("");
          return `<li class="network-adapter">
            <div class="network-adapter__name">${sumI18nSpan(a.name, esc)}</div>
            <div class="network-adapter__meta"><span class="muted-label">Medium</span> ${sumI18nSpan(a.medium, esc)}</div>
            <div class="network-adapter__meta"><span class="muted-label">IPv4</span> <span class="network-wrap">${sumI18nSpan(a.ipv4Display, esc)}</span></div>
            <div class="network-adapter__meta"><span class="muted-label">IPv6 address(es)</span> <span class="network-wrap">${sumI18nSpan(a.ipv6Display, esc)}</span></div>
            <div class="network-adapter__meta"><span class="muted-label">IPv6 status</span> ${sumI18nSpan(a.ipv6.summary, esc)}</div>
            <div class="network-adapter__details">${det}</div>
          </li>`;
        })
        .join("")}</ul>`;
    } else {
      netBody =
        '<p class="summary-empty">No matching adapters (usable IPv4 or global IPv6, plus DNS or gateway/DHCP server in the export). Bluetooth and PAN are ignored.</p>';
    }

    const overviewBody = `<dl class="system-summary-dl">
      <dt>System Type</dt><dd>${sumI18nSpan(sum.systemTypeRaw, esc)}</dd>
      <dt>Processor</dt><dd class="system-summary-dd--wrap">${sumI18nSpan(sum.processor, esc)}</dd>
      <dt>Platform Role</dt><dd>${sumI18nSpan(sum.platformRole, esc)}</dd>
      <dt>Time Zone</dt><dd>${sumI18nSpan(sum.timeZone, esc)}</dd>
      <dt>Classification</dt><dd>${sumI18nSpan(sum.systemForm, esc)}</dd>
    </dl>`;
    const overviewHtml = renderReportCategoryAccordion("System Overview", overviewBody, esc, { open: true, icon: "system" });

    const mem = sum.memory || {};
    const memoryBody = `<dl class="system-summary-dl">
      <dt>Installed Physical Memory (RAM)</dt><dd>${sumI18nSpan(mem.installedRam, esc)}</dd>
      <dt>Total Physical Memory</dt><dd>${sumI18nSpan(mem.totalPhysical, esc)}</dd>
      <dt>Available Physical Memory</dt><dd>${sumI18nSpan(mem.availablePhysical, esc)}</dd>
      <dt>Total Virtual Memory</dt><dd>${sumI18nSpan(mem.totalVirtual, esc)}</dd>
      <dt>Available Virtual Memory</dt><dd>${sumI18nSpan(mem.availableVirtual, esc)}</dd>
      <dt>Page File Space</dt><dd>${sumI18nSpan(mem.pageFileSpace, esc)}</dd>
      <dt>Page File Location(s)</dt><dd class="system-summary-dd--wrap">${sumI18nSpan(mem.pageFileLocation, esc)}</dd>
    </dl>`;
    const memoryHtml = renderReportCategoryAccordion("Memory Information", memoryBody, esc, { icon: "memory" });

    const storageDrives = sum.storageDrives || [];
    const storageBody =
      storageDrives.length > 0
        ? `<div class="system-ext-stack">${storageDrives
            .map(
              (d) => `<article class="system-storage-card"><h4 class="system-storage-card__title">${sumI18nSpan(d.title, esc)}</h4>
      <dl class="system-summary-dl system-summary-dl--compact">
        <dt>File System</dt><dd>${sumI18nSpan(d.fileSystem, esc)}</dd>
        <dt>Total Size</dt><dd class="system-summary-dd--wrap">${sumI18nSpan(d.totalSize, esc)}</dd>
        <dt>Free Space</dt><dd class="system-summary-dd--wrap">${sumI18nSpan(d.freeSpace, esc)}</dd>
        <dt>Used</dt><dd>${sumI18nSpan(d.used, esc)}</dd>
        <dt>Volume Name</dt><dd>${sumI18nSpan(d.volumeName, esc)}</dd>
        <dt>Serial Number</dt><dd>${sumI18nSpan(d.serialNumber, esc)}</dd>
      </dl></article>`
            )
            .join("")}</div>`
        : `<p class="summary-empty">No disk or volume details found in this export (look for <strong>Components → Storage → Disks</strong> in MSInfo).</p>`;
    const storageHtml = renderReportCategoryAccordion("Storage Drives", storageBody, esc, {
      count: storageDrives.length || null,
      icon: "disk",
    });

    const startups = sum.startupPrograms || [];
    const startupBody =
      startups.length > 0
        ? `<div class="system-ext-scroll"><table class="system-ext-table" aria-label="Startup programs"><thead><tr><th scope="col">Name</th><th scope="col">Command</th><th scope="col">Location</th><th scope="col">User</th></tr></thead><tbody>${startups
            .map(
              (s) =>
                `<tr><td class="system-ext-td-name">${sumI18nSpan(s.name, esc)}</td><td class="system-summary-dd--wrap">${sumI18nSpan(s.command, esc)}</td><td class="system-summary-dd--wrap">${sumI18nSpan(s.location, esc)}</td><td>${sumI18nSpan(s.user, esc)}</td></tr>`
            )
            .join("")}</tbody></table></div>`
        : `<p class="summary-empty">No startup program entries found (export may omit <strong>Software Environment → Startup Programs</strong>).</p>`;
    const startupHtml = renderReportCategoryAccordion("Startup Applications", startupBody, esc, {
      count: startups.length || null,
      icon: "startup",
    });

    const svcAll = sum.servicesAll || [];
    const svcRows = (list) =>
      list.length > 0
        ? `<div class="system-ext-scroll"><table class="system-ext-table" aria-label="Services"><thead><tr><th scope="col">Name</th><th scope="col">State</th><th scope="col">Startup type</th></tr></thead><tbody>${list
            .map(
              (s) =>
                `<tr><td class="system-ext-td-name">${sumI18nSpan(s.name, esc)}</td><td>${sumI18nSpan(s.state, esc)}</td><td>${sumI18nSpan(s.startMode, esc)}</td></tr>`
            )
            .join("")}</tbody></table></div>`
        : `<p class="summary-empty">No service rows found.</p>`;
    const servicesBody = svcRows(svcAll);
    const servicesHtml = renderReportCategoryAccordion("Services", servicesBody, esc, {
      count: svcAll.length || null,
      icon: "services",
    });
    const runningList = sum.runningServices || [];
    const runningBody =
      runningList.length > 0
        ? svcRows(runningList)
        : `<p class="summary-empty">No Windows <strong>Services</strong> rows matched a running state (including localized text such as <em>Выполняется</em>, <em>Работает</em>, <em>Запущена</em>, or <em>RUNNING</em>). Only <strong>Software Environment → Services</strong> is used here — the <strong>Running Tasks</strong> / <strong>Выполняющиеся задачи</strong> process list is a different MSInfo section.</p>`;
    const runningHtml = renderReportCategoryAccordion("Running Services", runningBody, esc, {
      count: runningList.length || null,
      icon: "running",
    });

    const wer = sum.windowsErrorReports || [];
    const werBody = renderWindowsErrorReportsBody(wer, esc);
    const werHtml = renderReportCategoryAccordion("Windows Error Reports", werBody, esc, {
      count: wer.length || null,
      icon: "wer",
    });

    const os = sum.os || { name: "", versionLine: "", build: "", installDate: "" };
    const osDl = `<dl class="system-summary-dl">
      <dt>OS Name</dt><dd>${sumI18nSpan(os.name, esc)}</dd>
      <dt>Version</dt><dd class="system-summary-dd--wrap">${sumI18nSpan(os.versionLine, esc)}</dd>
      <dt>Build</dt><dd>${sumI18nSpan(os.build, esc)}</dd>
      <dt>Original Install Date</dt><dd>${sumI18nSpan(os.installDate, esc)}</dd>
    </dl>`;
    const osBody = `${osDl}${renderWindowsUpdatesOsEmbed(sum, esc)}`;
    const osHtml = renderReportCategoryAccordion("OS Information", osBody, esc, { icon: "os" });

    const recHtml = renderReportCategoryAccordion("Recommendations & Updates", renderRecommendationsCard(sum, true), esc, {
      icon: "rec",
    });
    const gpuHtml = renderReportCategoryAccordion("Graphics (GPU)", gpuDashboardEmbed, esc, {
      count: gpuCount || null,
      icon: "gpu",
      open: true,
    });
    const netCount = Array.isArray(sum.networkAdapters) ? sum.networkAdapters.length : 0;
    const networkHtml = renderReportCategoryAccordion("Network (Internet)", netBody, esc, {
      count: netCount || null,
      icon: "network",
    });

    el.innerHTML = `${xmlRepairBanner}${recoveryBanner}
<div class="system-summary-stack">
  ${overviewHtml}
  ${memoryHtml}
  ${storageHtml}
  ${startupHtml}
  ${servicesHtml}
  ${runningHtml}
  ${osHtml}
  ${mbBiosHtml}
  ${recHtml}
  ${gpuHtml}
  ${problemDevicesHtml}
  ${networkHtml}
  ${werHtml}
</div>`;
  }

  /** @param {string} s */
  function esc(s) {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  /**
   * @param {ReturnType<typeof extractSystemSummary>} sum
   * @param {boolean} [embed] when true, omit outer section (for parent accordion)
   */
  function renderRecommendationsCard(sum, embed) {
    const inner = `<div class="rec-head">
        <span class="rec-head__bulb" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.5V17h8v-2.5A7 7 0 0 0 12 2z" />
          </svg>
        </span>
        <h3 id="rec-heading" class="rec-head__title">Recommendations</h3>
      </div>
      <p class="rec-windows-only-hint">Windows Update (build and status cards) is under <strong>OS Information</strong> above. Motherboard, BIOS, and firmware links are under <strong>Motherboard &amp; BIOS</strong> above.</p>`;
    if (embed) {
      return `<div class="summary-card--rec summary-card--rec--embed">${inner}</div>`;
    }
    return `<section class="summary-card summary-card--wide summary-card--rec" aria-labelledby="rec-heading">${inner}</section>`;
  }

  /** Common bug check codes → offline hints (not a substitute for WinDbg). */
  const BUGCHECK_BY_HEX = {
    "0000000a": {
      name: "IRQL_NOT_LESS_OR_EQUAL",
      causes: [
        "Kernel driver accessed pageable memory at wrong IRQL — often a buggy or outdated third-party driver.",
        "Bad RAM, unstable overclock, or XMP can also trigger this; run memory tests if drivers are ruled out.",
        "If it started after an update, roll back or reinstall chipset / GPU / storage / network drivers.",
      ],
    },
    "0000001e": {
      name: "KMODE_EXCEPTION_NOT_HANDLED",
      causes: [
        "Kernel-mode code threw an exception the OS did not handle — frequently a faulty driver.",
        "Check the faulting module name in the dump or Event details; update or remove that driver.",
        "Corrupt system files: run DISM and SFC if multiple unrelated drivers appear innocent.",
      ],
    },
    "00000024": {
      name: "NTFS_FILE_SYSTEM",
      causes: [
        "NTFS driver or disk subsystem problem — disk errors, bad cable (SATA/NVMe), or failing drive.",
        "Run disk health checks (SMART) and chkdsk on the volume that hosts Windows.",
        "Storage filter drivers (encryption, RAID, backup) can also be involved.",
      ],
    },
    "0000002e": {
      name: "DATA_BUS_ERROR",
      causes: [
        "Hardware memory or system bus error — RAM, motherboard, or device DMA issues.",
        "Test RAM, re-seat modules, disable overclock; check for recent hardware changes.",
      ],
    },
    "0000003b": {
      name: "SYSTEM_SERVICE_EXCEPTION",
      causes: [
        "Exception in a system service — graphics stack, antivirus minifilter, or other kernel drivers common.",
        "Update GPU driver (especially after games / sleep resume); remove recent security software to test.",
      ],
    },
    "00000050": {
      name: "PAGE_FAULT_IN_NONPAGED_AREA",
      causes: [
        "Invalid memory reference in non-paged pool — often driver or defective RAM.",
        "New or beta drivers are a prime suspect; memory diagnostics if swapping drivers does not help.",
      ],
    },
    "0000007a": {
      name: "KERNEL_DATA_INPAGE_ERROR",
      causes: [
        "Windows could not read kernel data from disk — failing storage, cable, or file-system corruption.",
        "Check drive health, connections, and run chkdsk; look for storahci/stornvme in the stack.",
      ],
    },
    "0000007e": {
      name: "SYSTEM_THREAD_EXCEPTION_NOT_HANDLED",
      causes: [
        "Unhandled exception in a system thread — almost always a driver; note the module in the analysis.",
        "If parameters mention a .sys file, update or remove that package first.",
      ],
    },
    "0000007f": {
      name: "UNEXPECTED_KERNEL_MODE_TRAP",
      causes: [
        "CPU reported a trap the kernel did not expect — hardware (overheat, RAM), BIOS, or driver bug.",
        "Disable overclock, update BIOS cautiously, and check temperatures under load.",
      ],
    },
    "0000009f": {
      name: "DRIVER_POWER_STATE_FAILURE",
      causes: [
        "Driver did not complete power IRPs correctly — common around sleep/hibernate and USB/storage.",
        "Update chipset, storage, and GPU drivers; try disabling fast startup as a test.",
      ],
    },
    "000000c4": {
      name: "DRIVER_VERIFIER_DETECTED_VIOLATION",
      causes: [
        "Driver Verifier caught a driver breaking rules — the named driver is the one to fix or update.",
        "Turn off Verifier after collecting logs if the machine is unusable.",
      ],
    },
    "000000c5": {
      name: "DRIVER_CORRUPTED_EXPOOL",
      causes: [
        "Driver corrupted pool memory — update or remove the suspect driver from the dump / event text.",
      ],
    },
    "000000d1": {
      name: "DRIVER_IRQL_NOT_LESS_OR_EQUAL",
      causes: [
        "Driver touched pageable memory at DISPATCH_LEVEL or higher — classic buggy driver signature.",
        "Update the driver that appears in the stack or was recently installed.",
      ],
    },
    "000000ea": {
      name: "THREAD_STUCK_IN_DEVICE_DRIVER",
      causes: [
        "GPU driver thread stuck — update or clean-install GPU drivers; check thermals and power limits.",
        "TDR-related; can accompany display hangs under load.",
      ],
    },
    "000000ef": {
      name: "CRITICAL_PROCESS_DIED",
      causes: [
        "A critical user-mode process terminated unexpectedly — corrupt install, bad update, or security software.",
        "Check Reliability History; repair Windows or restore from a restore point if recent change.",
      ],
    },
    "00000116": {
      name: "VIDEO_TDR_FAILURE",
      causes: [
        "GPU reset (TDR) — driver bug, unstable overclock, power limit, or overheating under load.",
        "Clean-install GPU driver; reduce OC / power cap; ensure adequate PSU and cooling.",
        "If TDR persists with clean drivers and normal thermals, log GPU power rails under load — weak PSU, daisy-chained PCIe power, or connector resistance can cause resets that look like software faults.",
      ],
    },
    "00000117": {
      name: "VIDEO_TDR_TIMEOUT_DETECTED",
      causes: [
        "Display driver stopped responding and recovered — same family of causes as 0x116.",
        "Stress-test after a clean driver install; check Event Viewer for preceding WHEA or power errors.",
        "Correlate with Kernel-Power / Event 41 entries: sudden power loss or PSU transients can surface as display timeouts under heavy GPU spikes.",
      ],
    },
    "00000124": {
      name: "WHEA_UNCORRECTABLE_ERROR",
      causes: [
        "Hardware error reported by CPU/platform — RAM, CPU, PCIe device, motherboard VRM, or unstable power delivery.",
        "Review WHEA events for bus / memory details; test RAM, re-seat GPU, avoid marginal overclocks.",
        "PSU voltage droop or overloaded 12V rails under transient GPU+CPU load can contribute — rule out with a known-good PSU or separate PCIe cables before replacing CPU/RAM.",
      ],
    },
    "00000127": {
      name: "PAGE_NOT_ZERO",
      causes: [
        "Memory management inconsistency — can indicate bad RAM or rare driver bugs.",
      ],
    },
    "00000133": {
      name: "DPC_WATCHDOG_VIOLATION",
      causes: [
        "DPC or ISR ran too long — storage/USB drivers, virtualization, or BIOS storage modes (RAID/IRST).",
        "Update chipset and storage drivers; try latest BIOS; disconnect new USB devices to test.",
      ],
    },
    "00000139": {
      name: "KERNEL_SECURITY_CHECK_FAILURE",
      causes: [
        "Kernel detected corruption of critical structures — driver bug or memory corruption.",
        "Update all kernel-mode drivers; memory test if it persists after driver cleanup.",
      ],
    },
    "0000013a": {
      name: "KERNEL_MODE_HEAP_CORRUPTION",
      causes: [
        "Heap corruption in kernel — typically a driver writing past buffers; update or remove recent drivers.",
      ],
    },
    "00000144": {
      name: "BUGCODE_USB_DRIVER",
      causes: [
        "USB driver fault — problem device, hub, or controller driver; try different ports and update chipset/USB.",
      ],
    },
    "000000fe": {
      name: "BUGCODE_USB_DRIVER (older hex)",
      causes: [
        "USB driver fault — same family as 0x144 on newer builds; try different ports and update chipset/USB drivers.",
      ],
    },
    "00000218": {
      name: "MANUALLY_INITIATED_CRASH",
      causes: [
        "Crash was triggered on purpose (e.g. keyboard combo or kernel debugger) — not a hardware failure.",
      ],
    },
    "000000fc": {
      name: "ATTEMPTED_EXECUTE_OF_NOEXECUTE_MEMORY",
      causes: [
        "Execution from non-executable pages — exploit mitigation or buggy driver; update Windows and drivers.",
      ],
    },
    "00000031": {
      name: "PHASE0_INITIALIZATION_FAILED",
      causes: [
        "Early boot initialization failed — boot driver or hardware issue; recovery / clean boot troubleshooting.",
      ],
    },
    "c000021a": {
      name: "STATUS_SYSTEM_PROCESS_TERMINATED (often shown as hex in events)",
      causes: [
        "Critical user-mode subsystem failed (logon / winlogon path) — corrupt system files or incompatible software.",
        "Offline repair, DISM, or in-place repair install may be needed if SFC cannot fix it.",
      ],
    },
  };

  const BUGCHECK_NAME_TO_HEX = {
    IRQL_NOT_LESS_OR_EQUAL: "0000000a",
    KMODE_EXCEPTION_NOT_HANDLED: "0000001e",
    NTFS_FILE_SYSTEM: "00000024",
    SYSTEM_SERVICE_EXCEPTION: "0000003b",
    PAGE_FAULT_IN_NONPAGED_AREA: "00000050",
    KERNEL_DATA_INPAGE_ERROR: "0000007a",
    SYSTEM_THREAD_EXCEPTION_NOT_HANDLED: "0000007e",
    DRIVER_POWER_STATE_FAILURE: "0000009f",
    DRIVER_VERIFIER_DETECTED_VIOLATION: "000000c4",
    DRIVER_IRQL_NOT_LESS_OR_EQUAL: "000000d1",
    THREAD_STUCK_IN_DEVICE_DRIVER: "000000ea",
    CRITICAL_PROCESS_DIED: "000000ef",
    VIDEO_TDR_FAILURE: "00000116",
    VIDEO_TDR_TIMEOUT_DETECTED: "00000117",
    WHEA_UNCORRECTABLE_ERROR: "00000124",
    DPC_WATCHDOG_VIOLATION: "00000133",
    KERNEL_SECURITY_CHECK_FAILURE: "00000139",
    KERNEL_MODE_HEAP_CORRUPTION: "0000013a",
    BUGCODE_USB_DRIVER: "00000144",
  };

  const BSOD_SYS_IGNORE = new Set([
    "ntoskrnl.exe",
    "hal.dll",
    "win32k.sys",
    "win32kbase.sys",
    "win32kfull.sys",
    "ntfs.sys",
    "storport.sys",
  ]);

  const MS_LEARN_DEBUGGER_BASE = "https://learn.microsoft.com/en-us/windows-hardware/drivers/debugger/";
  const MS_BUGCHECK_REFERENCE = `${MS_LEARN_DEBUGGER_BASE}bug-check-code-reference2`;

  /** Path tails for Microsoft Learn bug-check articles (explicit slugs; dash style varies by page). */
  const BUGCHECK_DOC_TAIL = {
    "0000000a": "bug-check-0xa--irql-not-less-or-equal",
    "0000001e": "bug-check-0x1e--kmode-exception-not-handled",
    "00000024": "bug-check-0x24--ntfs-file-system",
    "0000002e": "bug-check-0x2e--data-bus-error",
    "0000003b": "bug-check-0x3b--system-service-exception",
    "00000050": "bug-check-0x50--page-fault-in-nonpaged-area",
    "0000007a": "bug-check-0x7a--kernel-data-inpage-error",
    "0000007e": "bug-check-0x7e--system-thread-exception-not-handled",
    "0000007f": "bug-check-0x7f--unexpected-kernel-mode-trap",
    "0000009f": "bug-check-0x9f--driver-power-state-failure",
    "000000c4": "bug-check-0xc4--driver-verifier-detected-violation",
    "000000c5": "bug-check-0xc5--driver-corrupted-expool",
    "000000d1": "bug-check-0xd1--driver-irql-not-less-or-equal",
    "000000ea": "bug-check-0xea--thread-stuck-in-device-driver",
    "000000ef": "bug-check-0xef--critical-process-died",
    "00000116": "bug-check-0x116---video-tdr-failure",
    "00000117": "bug-check-0x117---video-tdr-timeout-detected",
    "00000124": "bug-check-0x124---whea-uncorrectable-error",
    "00000127": "bug-check-0x127---page-not-zero",
    "00000133": "bug-check-0x133-dpc-watchdog-violation",
    "00000139": "bug-check-0x139--kernel-security-check-failure",
    "0000013a": "bug-check-0x13a--kernel-mode-heap-corruption",
    "00000144": "bug-check-0x144--bugcode-usb3-driver",
    "000000fe": "bug-check-0xfe--bugcode-usb-driver",
    "000000fc": "bug-check-0xfc---attempted-execute-of-noexecute-memory",
    "00000031": "bug-check-0x31--phase0-initialization-failed",
    c000021a: "bug-check-0xc000021a--winlogin-fatal-error",
  };

  /** @param {string} norm */
  function bugcheckMicrosoftDocUrl(norm) {
    const tail = BUGCHECK_DOC_TAIL[norm];
    return tail ? MS_LEARN_DEBUGGER_BASE + tail : null;
  }

  /**
   * @param {string} text
   * @returns {{ imageName: string, moduleName: string, failureBucket: string, processName: string, probablyCaused: string }}
   */
  function extractBsodStructuredHints(text) {
    const t = String(text || "");
    const pick = (/** @type {RegExp} */ re) => {
      const m = t.match(re);
      if (!m) return "";
      return m[1].replace(/\s+/g, " ").trim().slice(0, 420);
    };
    return {
      imageName: pick(/^\s*IMAGE_NAME:\s*([^\n\r]+)/im),
      moduleName: pick(/^\s*MODULE_NAME:\s*([^\n\r]+)/im),
      failureBucket: pick(/^\s*FAILURE_BUCKET_ID:\s*([^\n\r]+)/im),
      processName: pick(/^\s*PROCESS_NAME:\s*([^\n\r]+)/im),
      probablyCaused: pick(/probably\s+caused\s+by\s*:\s*([^\n\r]+)/i),
    };
  }

  /** @param {string} text */
  function extractWinDbgArgumentsSnippet(text) {
    const lines = String(text || "").split(/\r?\n/);
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      if (!/^\s*Arguments:\s*$/i.test(lines[i])) continue;
      let j = i + 1;
      while (j < lines.length && out.length < 8) {
        const L = lines[j];
        if (/^\s*Arg[0-9]+\s*:/i.test(L)) {
          out.push(L.trim());
          j++;
          continue;
        }
        break;
      }
      break;
    }
    return out.join("\n").slice(0, 900);
  }

  /**
   * @param {string[]} drivers
   * @param {{ imageName: string, moduleName: string, probablyCaused: string }} structured
   */
  function filterDriversAlreadyHighlighted(drivers, structured) {
    const bases = new Set();
    const add = (/** @type {string} */ s) => {
      const m = String(s).trim().match(/([A-Za-z0-9_\-]+\.(?:sys|dll))\b/i);
      if (m) bases.add(m[1].toLowerCase());
    };
    add(structured.imageName);
    add(structured.moduleName);
    if (structured.probablyCaused) add(structured.probablyCaused);
    return drivers.filter((d) => !bases.has(d.toLowerCase()));
  }

  /** @param {string} raw */
  function normalizeBugcheckHex(raw) {
    const m = String(raw).trim().match(/^(?:0x)?([0-9a-f]+)$/i);
    if (!m) return null;
    let h = m[1].toLowerCase();
    if (!h) return null;
    if (h.length > 8) h = h.slice(-8);
    else h = h.padStart(8, "0");
    if (h === "00000000") return null;
    return h;
  }

  /** @param {string} norm */
  function lookupBugcheckInfo(norm) {
    const direct = BUGCHECK_BY_HEX[norm];
    if (direct) return { known: true, name: direct.name, causes: direct.causes };
    return {
      known: false,
      name: "Unlisted bug check code",
      causes: [
        "This code is not in the built-in table — search Microsoft’s bug check code reference for the exact hex value.",
        "A kernel dump analyzed with WinDbg (!analyze -v) identifies the faulting module most reliably.",
      ],
    };
  }

  /**
   * @param {string} text
   * @returns {{ norm: string, display: string, line: string, lineNo: number }[]}
   */
  function extractBugchecksFromText(text) {
    const lines = text.split(/\r?\n/);
    /** @type {Map<string, { norm: string, display: string, line: string, lineNo: number }>} */
    const byNorm = new Map();
    const tryAdd = (rawHex, line, lineNo) => {
      const norm = normalizeBugcheckHex(rawHex);
      if (!norm) return;
      if (byNorm.has(norm)) return;
      const display = `0x${norm}`;
      byNorm.set(norm, { norm, display, line: line.trim().slice(0, 280), lineNo });
    };

    const lineRes = [
      /bugcheck\s*(?:code|id)?\s*[:=]\s*(0x[0-9a-f]+)/gi,
      /\bstop\s*(?:code)?\s*[:#]?\s*(0x[0-9a-f]+)/gi,
      /bugcheck\s+was\s*:\s*(0x[0-9a-f]+)/gi,
      /\bbugcheck\s+(0x[0-9a-f]+)\b/gi,
      /\b(?:blue\s*screen|bsod).*?(0x[0-9a-f]{2,16})\b/gi,
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const re of lineRes) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(line))) tryAdd(m[1], line, i + 1);
      }
    }

    const blobRes = [
      /<(?:Data|data)\b[^>]*>\s*(0x[0-9a-f]+)\s*<\/(?:Data|data)>/gi,
      /"BugcheckCode"\s*:\s*"?([0-9]+)"?/gi,
    ];
    for (const re of blobRes) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text))) {
        if (/^[0-9]+$/.test(m[1])) {
          const n = parseInt(m[1], 10);
          if (n > 0 && n < 0xffffffff) tryAdd(`0x${n.toString(16)}`, m[0].slice(0, 200), 0);
        } else tryAdd(m[1], m[0].slice(0, 200), 0);
      }
    }

    for (const [name, hex] of Object.entries(BUGCHECK_NAME_TO_HEX)) {
      if (byNorm.has(hex)) continue;
      const re = new RegExp(`\\b${name.replace(/_/g, "[_\\s]")}\\b`, "i");
      if (re.test(text)) {
        byNorm.set(hex, {
          norm: hex,
          display: `0x${hex}`,
          line: `Matched bug check name: ${name.replace(/_/g, " ")}`,
          lineNo: 0,
        });
      }
    }

    return [...byNorm.values()].sort((a, b) => a.lineNo - b.lineNo || a.norm.localeCompare(b.norm));
  }

  /** @param {string} text */
  function extractDriverHints(text) {
    const out = [];
    const seen = new Set();
    const push = (s) => {
      const low = s.toLowerCase();
      if (seen.has(low)) return;
      seen.add(low);
      out.push(s);
    };

    const caused = text.matchAll(/probably\s+caused\s+by\s*[:]\s*([^\n\r]+)/gi);
    for (const m of caused) {
      const bit = m[1].trim().slice(0, 200);
      const sys = bit.match(/\b([A-Za-z0-9_\-]+\.(?:sys|dll))\b/i);
      if (sys) push(sys[1]);
    }

    const caused2 = text.matchAll(/caused\s+by\s+driver\s*[:]\s*([^\s\n\r]+)/gi);
    for (const m of caused2) {
      const f = m[1].trim();
      if (/\.(sys|dll)$/i.test(f)) push(f);
    }

    for (const m of text.matchAll(/\b([A-Za-z][A-Za-z0-9_]{0,36}\.sys)\b/g)) {
      const base = m[1];
      if (BSOD_SYS_IGNORE.has(base.toLowerCase())) continue;
      push(base);
      if (out.length >= 24) break;
    }
    return out.slice(0, 20);
  }

  /**
   * @param {string} text
   * @param {{ norm: string, display: string, line: string, lineNo: number }[]} bugchecks
   * @param {string[]} drivers
   */
  function bsodExtraNotes(text, bugchecks, drivers) {
    const notes = [];
    const low = text.toLowerCase();
    const dlow = drivers.map((x) => x.toLowerCase()).join(" ");
    if (/nvlddmkm|nvrm|nvidia/i.test(text) || /nvlddmkm/i.test(dlow)) {
      notes.push("NVIDIA GPU driver (nvlddmkm) appears — try a clean install of the Studio or Game Ready driver.");
    }
    if (/amdkmdag|amdxx/i.test(text) || /amdkmdag/i.test(dlow)) {
      notes.push("AMD GPU driver appears in context — update AMD chipset + GPU package from AMD’s site.");
    }
    if (/igdkmd|intel.*graphics/i.test(low) || /igdkmd/i.test(dlow)) {
      notes.push("Intel graphics driver referenced — update Intel graphics DCH driver from Intel or Windows Update.");
    }
    if (/usbhub|usbxhci|usbccgp/i.test(dlow)) {
      notes.push("USB stack modules listed — try different ports, avoid hubs, update chipset/USB drivers.");
    }
    if (/storahci|stornvme|nvme/i.test(dlow)) {
      notes.push("Storage driver in context — check SSD health, cables, and chipset/storage driver updates.");
    }
    if (bugchecks.some((b) => b.norm === "00000116" || b.norm === "00000117" || b.norm === "000000ea")) {
      notes.push("Display / TDR class bugcheck — log GPU temperature and power under load after driver cleanup.");
    }
    if (bugchecks.some((b) => b.norm === "00000124")) {
      notes.push("WHEA points to hardware — note the reported bus / component in Event Viewer WHEA details if present.");
    }
    if (/rtwlane|rt26|netwtw|netwlv64|netwtw06|netwtw10|netwtw12/i.test(text) || /rtwlane|netwtw/i.test(dlow)) {
      notes.push("Wireless driver module appears — install the Wi‑Fi driver from the laptop/OEM page or Intel/Realtek; try Ethernet to rule out Wi‑Fi stack.");
    }
    if (/dxgkrnl|dxgmms/i.test(dlow) || /dxgkrnl|dxgmms/i.test(low)) {
      notes.push("DirectX graphics kernel appears in context — pair with GPU driver version, TDR history, and any recent display or game overlay updates.");
    }
    if (/(^|[\s,])ndis\.sys/i.test(dlow)) {
      notes.push("NDIS is in the module list — third‑party VPN, firewall, or Wi‑Fi filter drivers often load above it; test after uninstall or update.");
    }
    if (/fltmgr|volmgr/i.test(dlow)) {
      notes.push("Storage filter stack (volmgr / fltmgr) referenced — check disk health, backup tools, and encryption filters.");
    }
    if (/tcpip\.sys/i.test(dlow)) {
      notes.push("TCP/IP driver in context — look for LWF drivers, VPN, or packet capture tools updated for your Windows build.");
    }
    return notes;
  }

  /**
   * Plain-text triage only — not dump analysis. Surfaces PSU vs hardware vs driver *signals* for managers / first-line triage.
   * @param {string} sourceText
   * @param {ReturnType<typeof extractBugchecksFromText>} bugchecks
   * @param {ReturnType<typeof extractBsodStructuredHints>} structured
   * @returns {{ bullets: { tag: string, tagClass: string, text: string }[] } | null}
   */
  function buildBsodTriageAssessment(sourceText, bugchecks, structured) {
    const raw = String(sourceText || "");
    if (!raw.trim()) return null;
    const t = raw;
    const low = t.toLowerCase();
    const norms = new Set(bugchecks.map((b) => b.norm));
    /** @type {{ tag: string, tagClass: string, text: string }[]} */
    const bullets = [];
    const push = (tag, tagClass, text) => {
      if (bullets.some((b) => b.text === text)) return;
      bullets.push({ tag, tagClass, text });
    };

    if (norms.has("00000124")) {
      push(
        "Hardware",
        "hw",
        "STOP 0x124 (WHEA_UNCORRECTABLE_ERROR): platform-reported hardware fault. Prioritize WHEA / MC details, RAM and PCIe stability — and consider PSU / 12V delivery if errors cluster under heavy GPU+CPU transients."
      );
    }
    if (norms.has("0000002e")) {
      push(
        "Hardware",
        "hw",
        "STOP 0x2E (DATA_BUS_ERROR): memory or system bus — run memory diagnostics, re-seat DIMMs, remove unstable overclocks before chasing software-only fixes."
      );
    }
    if (norms.has("0000007a")) {
      push(
        "Storage / hardware",
        "hw",
        "STOP 0x7A (KERNEL_DATA_INPAGE_ERROR): Windows could not page from disk — failing drive, cable, or port. Check SMART, cables, and storage drivers."
      );
    }
    if (/whea|machine check|hardware error|corrected error|uncorrectable/i.test(t) && !norms.has("00000124")) {
      push(
        "Hardware",
        "hw",
        "WHEA or machine-check language appears — align with Microsoft’s WHEA troubleshooting; capture the specific error record if Event Viewer exports are pasted."
      );
    }

    const kernelPower =
      /kernel-?power/i.test(t) ||
      /provider[^\n]{0,120}kernel-?power/i.test(low) ||
      /event[^\n]{0,40}id[^\d]{0,4}41\b/i.test(low);
    const abruptShutdown =
      /lost power|unexpected shutdown|shut down unexpectedly|power loss|unexpectedly restarted/i.test(low);
    const psuWords = /\bpsu\b|power supply|12v|12\s*v|vrm\b|undervolt|pci[- ]?e power|daisy.?chain/i.test(t);
    const bugcheckZeroWith41 =
      kernelPower && (/bugcheckcode[^0-9a-f]*0\b/i.test(low) || /<bugcheckcode>\s*0\s*<\/bugcheckcode>/i.test(t));

    if (bugcheckZeroWith41 || (kernelPower && abruptShutdown)) {
      push(
        "Power / PSU context",
        "psu",
        "Kernel-Power (often Event ID 41) with bugcheck code 0 or “unexpected shutdown” language often means the OS did not cleanly shut down — lost AC, failing PSU, loose wall power, overloaded 12V rail, or GPU power connectors are common *physical* checks alongside drivers."
      );
    } else if (kernelPower) {
      push(
        "Power / PSU context",
        "psu",
        "Kernel-Power events appear — review timestamps against GPU load; pair with PSU capacity, cable routing, and whether multiple rails share heavy transient draw."
      );
    } else if (psuWords) {
      push(
        "Power / PSU context",
        "psu",
        "Paste mentions PSU, rails, VRM, or PCIe power explicitly — validate wattage headroom, cable integrity, and single-GPU power runs (avoid marginal daisy-chaining) when crashes track heavy load."
      );
    }

    if (norms.has("0000009f")) {
      push(
        "Power + driver",
        "mixed",
        "STOP 0x9F (DRIVER_POWER_STATE_FAILURE): a driver mishandled sleep / power IRPs — update chipset, GPU, and storage drivers; if only on resume from sleep, also rule out marginal PSU when waking under load."
      );
    }

    if (norms.has("000000d1") || norms.has("000000c5") || norms.has("000000c4") || norms.has("0000000a")) {
      push(
        "Driver-weighted",
        "drv",
        "Driver IRQL / pool / Verifier class codes — follow the faulting module from WinDbg (!analyze -v) before assuming PSU or RAM; many such crashes are fixed by a driver update or removal."
      );
    }
    if (
      structured.probablyCaused &&
      /\.sys\b/i.test(structured.probablyCaused) &&
      (norms.has("000000d1") || norms.has("0000000a") || norms.has("0000007e"))
    ) {
      push(
        "Driver-weighted",
        "drv",
        "“Probably caused by” names a kernel .sys together with a classic driver STOP — treat that module as the primary lead unless WHEA or storage errors contradict it."
      );
    }

    if (norms.has("00000116") || norms.has("00000117") || norms.has("000000ea")) {
      push(
        "GPU / mixed",
        "mixed",
        "Display / TDR class stops (0x116 / 0x117 / 0xEA): start with a clean GPU driver and thermals. If stable drivers + good temps still TDR under load, capture GPU-Z power and clocks — weak 12V delivery or connector resistance can mimic “driver” timeouts."
      );
    }

    if (!bullets.length) return null;
    return { bullets: bullets.slice(0, 7) };
  }

  /**
   * @param {string} text
   * @returns {{
   *   bugchecks: ReturnType<typeof extractBugchecksFromText>,
   *   drivers: string[],
   *   notes: string[],
   *   structured: ReturnType<typeof extractBsodStructuredHints>,
   *   argsSnippet: string,
   *   sourceText: string,
   * }}
   */
  function analyzeBsodText(text) {
    const raw = String(text || "");
    const t = raw.trim();
    if (!t) {
      return {
        bugchecks: [],
        drivers: [],
        notes: [],
        structured: { imageName: "", moduleName: "", failureBucket: "", processName: "", probablyCaused: "" },
        argsSnippet: "",
        sourceText: raw,
      };
    }
    const bugchecks = extractBugchecksFromText(t);
    const drivers = extractDriverHints(t);
    const notes = bsodExtraNotes(t, bugchecks, drivers);
    const structured = extractBsodStructuredHints(t);
    const argsSnippet = extractWinDbgArgumentsSnippet(t);
    return { bugchecks, drivers, notes, structured, argsSnippet, sourceText: raw };
  }

  /**
   * @param {HTMLElement} el
   * @param {ReturnType<typeof analyzeBsodText>} analysis
   * @param {string} metaLine
   */
  function renderBsodReport(el, analysis, metaLine) {
    const { bugchecks, drivers, notes, structured, argsSnippet, sourceText } = analysis;
    const disclaimer =
      "<strong>Heuristic only.</strong> This panel matches STOP / bug check patterns in plain text and maps common " +
      "codes to typical causes. It does not parse memory dumps (<code>.dmp</code>). Use WinDbg on the dump for " +
      "ground truth; use the links below for Microsoft’s official troubleshooting and developer references.";

    const resLinks = `<nav class="bsod-reslinks" aria-label="Official references">
      <a class="bsod-reslinks__a" href="https://www.windows.com/stopcode" target="_blank" rel="noopener noreferrer">Windows stop code help</a>
      <a class="bsod-reslinks__a" href="https://learn.microsoft.com/en-us/troubleshoot/windows-client/performance/stop-code-error-troubleshooting" target="_blank" rel="noopener noreferrer">Advanced stop code troubleshooting (IT)</a>
      <a class="bsod-reslinks__a" href="${esc(MS_BUGCHECK_REFERENCE)}" target="_blank" rel="noopener noreferrer">Bug check code reference</a>
      <a class="bsod-reslinks__a" href="https://learn.microsoft.com/en-us/windows-hardware/drivers/debugger/analyzing-a-kernel-mode-dump-file-with-windbg" target="_blank" rel="noopener noreferrer">Analyze a kernel dump (WinDbg)</a>
    </nav>`;

    const workflow = `<section class="bsod-workflow" aria-label="Suggested next steps">
      <h3 class="bsod-workflow__title">Suggested workflow</h3>
      <ol class="bsod-workflow__ol">
        <li>Record every STOP code shown here and any <strong>Probably caused by</strong> / <strong>IMAGE_NAME</strong> lines from your paste.</li>
        <li>Update or clean-reinstall the vendor driver that matches those names; temporarily remove new overlays, undervolt tools, or trial AV to test.</li>
        <li>If crashes repeat, enable a small memory dump and open it in <strong>WinDbg Preview</strong> with <code>!analyze -v</code>.</li>
        <li>For storage (e.g. 0x7A) or WHEA (0x124) codes, also check SMART, cables, thermals, RAM, and PSU stability.</li>
      </ol>
    </section>`;

    const structuredRows = [];
    if (structured.probablyCaused) structuredRows.push(["Probably caused by", structured.probablyCaused]);
    if (structured.imageName) structuredRows.push(["IMAGE_NAME", structured.imageName]);
    if (structured.moduleName) structuredRows.push(["MODULE_NAME", structured.moduleName]);
    if (structured.failureBucket) structuredRows.push(["FAILURE_BUCKET_ID", structured.failureBucket]);
    if (structured.processName) structuredRows.push(["PROCESS_NAME", structured.processName]);

    let structuredBlock = "";
    if (structuredRows.length) {
      const dls = structuredRows
        .map(
          ([k, v]) =>
            `<div class="bsod-structured__row"><dt class="bsod-structured__dt">${esc(k)}</dt><dd class="bsod-structured__dd"><code>${esc(
              v
            )}</code></dd></div>`
        )
        .join("");
      structuredBlock = `<section class="bsod-structured" aria-label="Fields parsed from text">
        <h3 class="bsod-structured__title">Parsed from your text</h3>
        <dl class="bsod-structured__dl">${dls}</dl>
        <p class="bsod-structured__hint">These fields usually come from WinDbg <code>!analyze -v</code> or similar exports. Prefer them over random <code>.sys</code> names appearing elsewhere in the file.</p>
      </section>`;
    }

    let argsBlock = "";
    if (argsSnippet.trim()) {
      argsBlock = `<section class="bsod-args" aria-label="Bug check parameters">
        <h3 class="bsod-args__title">Parameters (from paste)</h3>
        <pre class="bsod-args__pre" spellcheck="false">${esc(argsSnippet.trim())}</pre>
        <p class="bsod-args__hint">Compare with the official article for your STOP code — parameter meanings differ per bug check.</p>
      </section>`;
    }

    const triage = buildBsodTriageAssessment(sourceText ?? "", bugchecks, structured);
    let triageBlock = "";
    if (triage?.bullets?.length) {
      const lis = triage.bullets
        .map(
          (b) =>
            `<li class="bsod-triage__item"><span class="bsod-triage__tag bsod-triage__tag--${esc(b.tagClass)}">${esc(
              b.tag
            )}</span> <span class="bsod-triage__txt">${esc(b.text)}</span></li>`
        )
        .join("");
      triageBlock = `<section class="bsod-triage" aria-label="Power versus hardware versus driver triage read">
        <h3 class="bsod-triage__title">Power · hardware · driver — triage read</h3>
        <p class="bsod-triage__lead"><strong>Heuristic only.</strong> Reads pasted text and STOP codes — not a kernel dump. Use WinDbg on the <code>.dmp</code> for proof; use this box to brief where to investigate first (PSU vs platform vs driver).</p>
        <ul class="bsod-triage__list">${lis}</ul>
        <p class="bsod-triage__foot">PSU problems rarely say “PSU bad” in plain text — combine Kernel-Power / Event 41, TDR-under-load, and WHEA patterns; when WHEA or storage-inpage dominates, treat hardware path first.</p>
      </section>`;
    }

    let cards = "";
    if (bugchecks.length) {
      const items = bugchecks
        .map((b) => {
          const info = lookupBugcheckInfo(b.norm);
          const causes = info.causes.map((c) => `<li>${esc(c)}</li>`).join("");
          const ctx =
            b.lineNo > 0
              ? `Line ${b.lineNo}: ${esc(b.line)}`
              : `Context: ${esc(b.line)}`;
          const knownTag = info.known ? "" : ' <span class="bsod-unknown">(not in local table — use Microsoft reference)</span>';
          const specific = bugcheckMicrosoftDocUrl(b.norm);
          const docHref = specific || MS_BUGCHECK_REFERENCE;
          const docLabel = specific ? "Microsoft Learn: article for this bug check" : "Bug check code reference (find this hex)";
          return `<li class="bsod-card">
            <h3 class="bsod-card__title"><span class="bsod-card__code">${esc(b.display)}</span> — ${esc(
            info.name
          )}${knownTag}</h3>
            <p class="bsod-card__doc"><a href="${esc(docHref)}" target="_blank" rel="noopener noreferrer">${esc(
            docLabel
          )}</a></p>
            <p class="bsod-causes-label">Typical causes to investigate</p>
            <ul class="bsod-causes">${causes}</ul>
            <p class="bsod-context">${esc(ctx)}</p>
          </li>`;
        })
        .join("");
      cards = `<ul class="bsod-cards" role="list">${items}</ul>`;
    } else {
      cards = `<div class="bsod-empty bsod-empty--rich" role="status">
        <p><strong>No STOP codes detected yet.</strong> Try one of the following:</p>
        <ul>
          <li>Event Viewer → Windows Logs → System → find “BugCheck” or “The computer has rebooted from a bugcheck” and copy the <strong>Details</strong> tab text.</li>
          <li>Paste the top of WinDbg <code>!analyze -v</code> (bugcheck line, arguments, <strong>IMAGE_NAME</strong> / <strong>Probably caused by</strong>).</li>
          <li>Load an <code>.nfo</code> in System Information, then use <strong>Merge MSInfo text</strong> here to scan the same buffer for bugcheck lines.</li>
        </ul>
      </div>`;
    }

    const driversExtra = filterDriversAlreadyHighlighted(drivers, structured);
    let driversBlock = "";
    if (driversExtra.length) {
      const lis = driversExtra.map((d) => `<li>${esc(d)}</li>`).join("");
      driversBlock = `<section class="bsod-drivers" aria-label="Other driver modules mentioned">
        <h3>Other kernel modules in text</h3>
        <ul>${lis}</ul>
        <p class="bsod-context">Additional <code>.sys</code> names found by pattern; treat as clues until confirmed in a dump or vendor documentation.</p>
      </section>`;
    }

    let notesBlock = "";
    if (notes.length) {
      const lis = notes.map((n) => `<li>${esc(n)}</li>`).join("");
      notesBlock = `<section class="bsod-drivers bsod-drivers--notes" aria-label="Additional hints">
        <h3>Correlation hints</h3>
        <ul>${lis}</ul>
      </section>`;
    }

    el.innerHTML = `<p class="bsod-disclaimer">${disclaimer}</p>
      ${resLinks}
      ${workflow}
      ${metaLine ? `<p class="bsod-meta-line">${esc(metaLine)}</p>` : ""}
      ${structuredBlock}
      ${argsBlock}
      ${triageBlock}
      ${cards}
      ${driversBlock}
      ${notesBlock}`;
  }

  function setupBsodPanel(panel) {
    const dropzone = panel.querySelector(".dropzone--bsod");
    const input = panel.querySelector(".file-input--bsod");
    const toolbar = panel.querySelector(".bsod-toolbar");
    const meta = panel.querySelector(".bsod-file-meta");
    const body = panel.querySelector(".bsod-body");
    const reportEl = panel.querySelector(".bsod-report");
    const pre = panel.querySelector(".content--bsod");
    const btnClear = panel.querySelector(".btn-bsod-clear");
    const btnMsinfo = panel.querySelector(".btn-bsod-msinfo");
    const pasteTa = panel.querySelector(".bsod-paste__textarea");
    const btnAnalyze = panel.querySelector(".btn-bsod-analyze");

    /** @type {{ name: string, buffer: ArrayBuffer } | null} */
    let fileState = null;
    let textState = "";

    function setVisible(loaded) {
      if (toolbar) toolbar.hidden = !loaded;
      if (body) body.hidden = !loaded;
      if (dropzone) dropzone.style.display = loaded ? "none" : "";
    }

    function applyPastedAnalysis() {
      const raw = (pasteTa?.value || "").trim();
      if (!raw) {
        window.alert("Paste some text first — for example the WinDbg !analyze -v output or Event Viewer bugcheck details.");
        pasteTa?.focus();
        return;
      }
      fileState = null;
      textState = raw;
      setVisible(true);
      refresh();
    }

    function refresh() {
      const t = textState.trim();
      if (pasteTa) pasteTa.value = t;
      if (pre) pre.textContent = t;
      if (!reportEl) return;
      const metaLine = fileState
        ? `${fileState.name} · ${(fileState.buffer.byteLength / 1024).toFixed(1)} KiB`
        : t
          ? "Pasted / merged text"
          : "";
      renderBsodReport(reportEl, analyzeBsodText(t), metaLine);
      if (meta) {
        meta.textContent = t
          ? `${metaLine}${t.length > 0 ? ` · ${t.length.toLocaleString()} characters` : ""}`
          : "";
      }
    }

    function loadFile(file) {
      const reader = new FileReader();
      reader.onload = () => {
        const buffer = reader.result;
        if (!(buffer instanceof ArrayBuffer)) return;
        fileState = { name: file.name, buffer };
        const { text } = decodeBuffer(buffer, "gpu", "auto");
        textState = text;
        setVisible(true);
        refresh();
      };
      reader.readAsArrayBuffer(file);
    }

    function preventDefaults(e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (dropzone) {
      ["dragenter", "dragover", "dragleave", "drop"].forEach((ev) => {
        dropzone.addEventListener(ev, preventDefaults);
      });
      dropzone.addEventListener("dragenter", () => dropzone.classList.add("is-dragover"));
      dropzone.addEventListener("dragleave", () => dropzone.classList.remove("is-dragover"));
      dropzone.addEventListener("dragover", () => dropzone.classList.add("is-dragover"));
      dropzone.addEventListener("drop", (e) => {
        dropzone.classList.remove("is-dragover");
        const dt = e.dataTransfer;
        if (!dt?.files?.length) return;
        loadFile(dt.files[0]);
      });
      dropzone.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          input?.click();
        }
      });
    }
    input?.addEventListener("change", () => {
      const f = input.files && input.files[0];
      if (f) loadFile(f);
      input.value = "";
    });

    btnAnalyze?.addEventListener("click", () => applyPastedAnalysis());
    pasteTa?.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      applyPastedAnalysis();
    });

    btnMsinfo?.addEventListener("click", () => {
      const sysPre = document.querySelector(".content--system");
      const extra = (sysPre?.textContent || "").trim();
      if (!extra) {
        window.alert(
          "No MSInfo text found. Load a system .nfo in the System Information panel first, then try again."
        );
        return;
      }
      const sep = "\n\n---------- Merged from MSInfo export ----------\n\n";
      textState = textState.trim() ? `${textState.trim()}${sep}${extra}` : extra;
      setVisible(true);
      if (!fileState && meta) meta.textContent = "MSInfo text merged (no separate file)";
      refresh();
    });

    btnClear?.addEventListener("click", () => {
      fileState = null;
      textState = "";
      if (pasteTa) pasteTa.value = "";
      if (pre) pre.textContent = "";
      if (reportEl) reportEl.innerHTML = "";
      if (meta) meta.textContent = "";
      setVisible(false);
    });

    setVisible(false);
  }

  /** @param {string} line */
  function splitCsvLine(line) {
    const out = [];
    let cur = "";
    let i = 0;
    while (i < line.length) {
      const ch = line[i];
      if (ch === '"') {
        i++;
        while (i < line.length) {
          if (line[i] === '"') {
            if (line[i + 1] === '"') {
              cur += '"';
              i += 2;
              continue;
            }
            i++;
            break;
          }
          cur += line[i];
          i++;
        }
        continue;
      }
      if (ch === ",") {
        out.push(cur.trim());
        cur = "";
        i++;
        continue;
      }
      cur += ch;
      i++;
    }
    out.push(cur.trim());
    return out;
  }

  /**
   * GPU-Z / sensor CSV headers often use °C; wrong decoding yields, ?, or "Â°".
   * @param {string} s
   */
  function normalizeSensorHeaderLabel(s) {
    let t = String(s || "").replace(/\uFEFF/g, "");
    t = t.replace(/Â°/g, "°");
    t = t.replace(/Â\s*°/g, "°");
    t = t.replace(/(\[[^\]]*?)\uFFFD(\s*C\])/gi, "$1°$2");
    t = t.replace(/(\[[^\]]*?)\uFFFD(\s*F\])/gi, "$1°$2");
    t = t.replace(/(\[[^\]]*?)\?(\s*C\])/g, "$1°$2");
    t = t.replace(/(\[[^\]]*?)\?(\s*F\])/g, "$1°$2");
    t = t.replace(/(\[[^\]]*?)\uFFFD\uFFFD(\s*C\])/gi, "$1°$2");
    t = t.replace(
      /([^,\n]*\bTemp(?:erature)?\b[^,\n]*)\[\s*C\]/gi,
      (/** @type {string} */ _m, /** @type {string} */ pre) => `${pre}[°C]`
    );
    t = t.replace(
      /([^,\n]*\bTemp(?:erature)?\b[^,\n]*)\[\s*F\]/gi,
      (/** @type {string} */ _m, /** @type {string} */ pre) => `${pre}[°F]`
    );
    return t.trim();
  }

  /** @param {string} text */
  function normalizeGpuSensorExportText(text) {
    return text
      .split(/\r?\n/)
      .map((line) => normalizeSensorHeaderLabel(line))
      .join("\n");
  }

  /** @param {string} cell */
  function parseNumericCell(cell) {
    const t = cell.trim().replace(/%/g, "").replace(/\s/g, "").replace(/,/g, ".");
    const raw = t.replace(/[^\d.eE+-]/g, "");
    if (raw === "" || raw === "-" || raw === "+") return NaN;
    return Number.parseFloat(raw);
  }

  /** @param {string} header */
  function inferUnitFromHeader(header) {
    const h = header.trim();
    if (/\bMHz\b/i.test(h)) return "MHz";
    if (/\bGHz\b/i.test(h)) return "GHz";
    if (/%/.test(h)) return "%";
    if (/\b°C\b|°\s*C|Celsius/i.test(h)) return "°C";
    if (/\b°F\b|Fahrenheit/i.test(h)) return "°F";
    if (/\btemp(erature)?\b/i.test(h) && !/\bMHz\b/i.test(h)) return "°C";
    if (/\bmv\b|\bmV\b/i.test(h)) return "mV";
    if (/\bV\b/i.test(h) && /volt/i.test(h)) return "V";
    if (/\bmw\b|\bmW\b/i.test(h)) return "mW";
    if (/\bW\b/i.test(h) && /power|watt/i.test(h)) return "W";
    if (/\bRPM\b/i.test(h)) return "RPM";
    if (/\bms\b/i.test(h)) return "ms";
    return "";
  }

  /** @param {string} h */
  function normalizeHeader(h) {
    return h.trim().toLowerCase().replace(/\s+/g, " ");
  }

  /**
   * @param {string} text
   * @returns {{ headers: string[], rows: string[][], rowCount: number, numericCols: { index: number, name: string, unit: string, pts: { r: number, v: number, t: number | null }[], min: number, max: number }[] } | null}
   */
  function parseSensorCsv(text) {
    const normalized = normalizeGpuSensorExportText(text);
    const lines = normalized.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
    if (lines.length < 2) return null;
    const headers = splitCsvLine(lines[0]).map((h) => normalizeSensorHeaderLabel(h));
    if (headers.length < 2) return null;
    const rows = lines.slice(1).map(splitCsvLine);
    const rowCount = rows.length;
    const colCount = headers.length;
    /** @type {{ index: number, name: string, unit: string, pts: { r: number, v: number, t: number | null }[], min: number, max: number }[]} */
    const numericCols = [];

    /** @param {string} cell */
    function parseTime(cell) {
      const s = cell.replace(/^"|"$/g, "").trim();
      const iso = s.replace(/^(\d{4}-\d{2}-\d{2})\s+/, "$1T");
      const d = Date.parse(iso);
      if (!Number.isNaN(d)) return d;
      const d2 = Date.parse(s);
      return Number.isNaN(d2) ? null : d2;
    }

    for (let c = 0; c < colCount; c++) {
      const pts = [];
      for (let r = 0; r < rowCount; r++) {
        const row = rows[r];
        if (c >= row.length) continue;
        const n = parseNumericCell(row[c]);
        if (!Number.isFinite(n)) continue;
        const t = c === 0 ? null : parseTime(row[0] || "");
        pts.push({ r, v: n, t });
      }
      const ratio = rowCount ? pts.length / rowCount : 0;
      if (pts.length >= 2 && ratio >= 0.5) {
        const vs = pts.map((p) => p.v);
        const min = Math.min(...vs);
        const max = Math.max(...vs);
        numericCols.push({
          index: c,
          name: headers[c] || `Column ${c + 1}`,
          unit: inferUnitFromHeader(headers[c] || ""),
          pts,
          min,
          max,
        });
      }
    }
    if (!numericCols.length) return null;
    return { headers, rows, rowCount, numericCols };
  }

  /** @param {string[]} headers @param {string} metric */
  function columnIndexForMetric(headers, metric) {
    const m = normalizeHeader(metric);
    let i = headers.findIndex((h) => normalizeHeader(h) === m);
    if (i >= 0) return i;
    i = headers.findIndex((h) => normalizeHeader(h).includes(m));
    if (i >= 0) return i;
    return headers.findIndex((h) => m.includes(normalizeHeader(h)));
  }

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{ label: string, color: string, unit: string, pts: { x: number, y: number }[], minY: number, maxY: number, minPt: { x: number, y: number }, maxPt: { x: number, y: number } }[]} series
   * @param {boolean} showPeaks
   */
  function drawComparisonChart(canvas, series, showPeaks) {
    const dpr = window.devicePixelRatio || 1;
    const cssW = Math.max(420, canvas.clientWidth || 960);
    const cssH = Math.max(400, canvas.clientHeight || 600);
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const W = cssW;
    const H = cssH;
    ctx.fillStyle = "#0d1210";
    ctx.fillRect(0, 0, W, H);

    const hScale = Math.min(1.45, Math.max(1, H / 380));
    const pad = {
      l: Math.round(82 * hScale),
      r: Math.round(28 * hScale),
      t: Math.round(40 * hScale),
      b: Math.round(58 * hScale),
    };
    const chartSans = 'system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
    const chartMono = 'ui-monospace, "Cascadia Code", Consolas, monospace';
    const innerW = W - pad.l - pad.r;
    const innerH = H - pad.t - pad.b;

    let yMin = Infinity;
    let yMax = -Infinity;
    for (const s of series) {
      if (s.pts.length < 2) continue;
      yMin = Math.min(yMin, s.minY);
      yMax = Math.max(yMax, s.maxY);
    }
    if (!Number.isFinite(yMin) || yMin === yMax) {
      yMin = 0;
      yMax = 1;
    }
    const yPad = (yMax - yMin) * 0.12 || 0.01;
    yMin -= yPad;
    yMax += yPad;

    let xMin = Infinity;
    let xMax = -Infinity;
    for (const s of series) {
      for (const p of s.pts) {
        xMin = Math.min(xMin, p.x);
        xMax = Math.max(xMax, p.x);
      }
    }
    if (!Number.isFinite(xMin) || xMin === xMax) {
      xMin = 0;
      xMax = 1;
    }
    const xSpan = xMax - xMin || 1;
    const xPad = xSpan * 0.03;
    xMin -= xPad;
    xMax += xPad;

    ctx.strokeStyle = "rgba(118, 185, 0, 0.22)";
    ctx.lineWidth = 1;
    const gridY = 5;
    const yTickFs = Math.round(10 + 2.2 * hScale);
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let g = 0; g <= gridY; g++) {
      const y = pad.t + (innerH * g) / gridY;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(pad.l + innerW, y);
      ctx.stroke();
      const val = yMax - ((yMax - yMin) * g) / gridY;
      ctx.fillStyle = "#aabdb4";
      ctx.font = `500 ${yTickFs}px ${chartMono}`;
      const u = series[0]?.unit || "";
      ctx.fillText(`${val.toFixed(2)}${u ? " " + u : ""}`, pad.l - 10, y);
    }
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";

    const xAt = (x) => pad.l + ((x - xMin) / (xMax - xMin || 1)) * innerW;
    const yAt = (y) => pad.t + innerH * (1 - (y - yMin) / (yMax - yMin || 1));

    const seriesLineW = Math.max(1, Math.min(1.45, 1 + 0.18 * (hScale - 1)));
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.save();
    ctx.globalAlpha = 0.92;
    for (const s of series) {
      if (s.pts.length < 2) continue;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = seriesLineW;
      ctx.beginPath();
      let first = true;
      for (const p of s.pts) {
        const px = xAt(p.x);
        const py = yAt(p.y);
        if (first) {
          ctx.moveTo(px, py);
          first = false;
        } else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    ctx.restore();

    if (showPeaks) {
      const peakFs = Math.round(11 + 1.6 * hScale);
      ctx.font = `500 ${peakFs}px ${chartSans}`;
      for (const s of series) {
        if (s.pts.length < 2) continue;
        const u = s.unit ? ` ${s.unit}` : "";
        const maxP = s.maxPt;
        const minP = s.minPt;
        const mx = xAt(maxP.x);
        const my = yAt(maxP.y);
        const nx = xAt(minP.x);
        const ny = yAt(minP.y);
        const pr = Math.max(2.5, Math.min(3.5, 2.5 + 0.35 * hScale));
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(mx, my, pr, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#e8f0ec";
        ctx.fillText(`▲ ${maxP.y.toFixed(2)}${u}`, Math.min(mx + 8, W - pad.r - 100), Math.max(my - 8, pad.t + 12));
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(nx, ny, pr, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#b8cce8";
        ctx.fillText(`▼ ${minP.y.toFixed(2)}${u}`, Math.min(nx + 8, W - pad.r - 100), Math.min(ny + 16, H - pad.b - 6));
      }
    }

    const legFs = Math.round(11 + 1.6 * hScale);
    ctx.fillStyle = "#8fa399";
    ctx.font = `500 ${legFs}px ${chartSans}`;
    let lx = pad.l;
    const sw = Math.round(9 + 0.6 * hScale);
    for (const s of series) {
      ctx.fillStyle = s.color;
      ctx.fillRect(lx, Math.round(10 + hScale), sw, sw);
      ctx.fillStyle = "#d2dfd8";
      ctx.fillText(s.label, lx + sw + 8, Math.round(20 + hScale));
      lx += ctx.measureText(s.label).width + sw + 28;
    }

    ctx.fillStyle = "#7a8c82";
    ctx.font = `500 ${Math.round(10 + 1.8 * hScale)}px ${chartMono}`;
    ctx.fillText("← time / sample →", pad.l, H - Math.round(12 + 4 * hScale));
  }

  /**
   * @param {{ parsed: ReturnType<typeof parseSensorCsv> | null, name: string, id: string }} log
   * @param {string} metricNameA
   * @param {string} metricNameB
   */
  function alignedRowVectors(log, metricNameA, metricNameB) {
    if (!log.parsed) return null;
    const idxA = columnIndexForMetric(log.parsed.headers, metricNameA);
    const idxB = columnIndexForMetric(log.parsed.headers, metricNameB);
    if (idxA < 0 || idxB < 0) return null;
    const colA = log.parsed.numericCols.find((c) => c.index === idxA);
    const colB = log.parsed.numericCols.find((c) => c.index === idxB);
    if (!colA || !colB) return null;
    const mapB = new Map(colB.pts.map((p) => [p.r, p.v]));
    const va = [];
    const vb = [];
    for (const p of colA.pts) {
      if (mapB.has(p.r)) {
        va.push(p.v);
        vb.push(/** @type {number} */ (mapB.get(p.r)));
      }
    }
    if (va.length < 8) return null;
    return { va, vb };
  }

  /** @param {number[]} va @param {number[]} vb */
  function pearsonCorrelation(va, vb) {
    const n = va.length;
    if (n !== vb.length || n < 5) return NaN;
    let sx = 0;
    let sy = 0;
    let sxx = 0;
    let syy = 0;
    let sxy = 0;
    for (let i = 0; i < n; i++) {
      const x = va[i];
      const y = vb[i];
      sx += x;
      sy += y;
      sxx += x * x;
      syy += y * y;
      sxy += x * y;
    }
    const num = n * sxy - sx * sy;
    const den = Math.sqrt(Math.max(0, (n * sxx - sx * sx) * (n * syy - sy * sy)));
    if (den < 1e-12) return NaN;
    return num / den;
  }

  /** @param {string} name */
  function metricSemanticClass(name) {
    const n = String(name).toLowerCase();
    if (/temp|°c|celsius|hotspot/i.test(n)) return "temp";
    if (/load|util|usage|busy/i.test(n)) return "load";
    if (/volt|vdd|voltage|mv\b|gpu core v/i.test(n)) return "voltage";
    if (/fan|rpm\b/i.test(n)) return "fan";
    if (/power|watt|tdp|energy|joule/i.test(n)) return "power";
    if (/clock|mhz|frequency|gpu\s*freq/i.test(n)) return "clock";
    if (/mem|vram|memory\s*clock/i.test(n)) return "mem";
    return "other";
  }

  /** Share of steps where both series move in the same direction (ignores flat-flat). */
  function stepDirectionAgreement(va, vb) {
    if (va.length !== vb.length || va.length < 6) return NaN;
    let tot = 0;
    let same = 0;
    for (let i = 1; i < va.length; i++) {
      const da = va[i] - va[i - 1];
      const db = vb[i] - vb[i - 1];
      if (da === 0 && db === 0) continue;
      tot++;
      if (da * db > 0) same++;
    }
    if (tot < 5) return NaN;
    return same / tot;
  }

  /**
   * Heuristic hints only — not a diagnosis.
   * @param {{ id: string, name: string, parsed: ReturnType<typeof parseSensorCsv> | null }[]} logs
   * @param {string[]} selectedMetrics
   * @returns {{ log: string, text: string }[]}
   */
  function buildGpuInsightLines(logs, selectedMetrics) {
    /** @type {{ log: string, text: string, rank: number }[]} */
    const lines = [];
    const pairSeen = new Set();
    if (selectedMetrics.length < 2) return [];

    const corrRank = (/** @type {number} */ absR) =>
      absR >= 0.72 ? 4 : absR >= 0.58 ? 3 : absR >= 0.48 ? 2 : absR >= 0.36 ? 1 : 0;

    for (const log of logs) {
      if (!log.parsed) continue;
      let weakPairsThisLog = 0;
      for (let i = 0; i < selectedMetrics.length; i++) {
        for (let j = i + 1; j < selectedMetrics.length; j++) {
          const a = selectedMetrics[i];
          const b = selectedMetrics[j];
          const pair = alignedRowVectors(log, a, b);
          if (!pair) continue;
          const r = pearsonCorrelation(pair.va, pair.vb);
          const absR = Number.isFinite(r) ? Math.abs(r) : 0;
          const pk = `${log.id}|${normalizeHeader(a)}|${normalizeHeader(b)}`;
          if (pairSeen.has(pk)) continue;

          const ca = metricSemanticClass(a);
          const cb = metricSemanticClass(b);
          const agree = stepDirectionAgreement(pair.va, pair.vb);

          if (Number.isFinite(r) && absR >= 0.48) {
            pairSeen.add(pk);
            const strength =
              absR >= 0.72 ? "Strong" : absR >= 0.58 ? "Moderate" : "Weak";
            const dir = r > 0 ? "increase together" : "move in opposite directions";
            let tail = "";
            if ((ca === "temp" && cb === "load") || (ca === "load" && cb === "temp")) {
              tail =
                r > 0
                  ? "Typical when GPU work drives heat. If temperature stays high while load looks low, check background apps or column alignment."
                  : "Inverse load/temperature pattern is unusual; verify units and that both columns share the same timebase.";
            } else if ((ca === "temp" && cb === "power") || (ca === "power" && cb === "temp")) {
              tail = r > 0 ? "Power draw and temperature often track together when workload changes." : "";
            } else if ((ca === "clock" && cb === "temp") || (ca === "temp" && cb === "clock")) {
              tail =
                r < -0.55
                  ? "Clock falling as temperature rises fits thermal or power throttling."
                  : r > 0.55
                    ? "Clock and temperature rising together often indicates ramping load."
                    : "";
            } else if ((ca === "load" && cb === "clock") || (ca === "clock" && cb === "load")) {
              tail = r > 0.5 ? "Load and clocks moving together is common when the GPU is boosting." : "";
            } else if ((ca === "voltage" && cb === "clock") || (ca === "clock" && cb === "voltage")) {
              tail =
                r < -0.45
                  ? "Voltage sag while clocks climb can hint at power delivery limits — compare with board power metrics if available."
                  : "";
            } else if ((ca === "fan" && cb === "temp") || (ca === "temp" && cb === "fan")) {
              tail =
                r < -0.42
                  ? "Fan ramping as temperature drops is the expected cooling loop; flat fans with rising temps suggest fan curve or sensor issues."
                  : r > 0.45
                    ? "Fan and temperature rising together may mean the cooler is chasing a hot GPU — check dust and mount."
                    : "";
            } else if ((ca === "power" && cb === "load") || (ca === "load" && cb === "power")) {
              tail =
                r > 0.52
                  ? "Load and board power moving together supports a healthy workload→power relationship."
                  : "";
            }
            lines.push({
              log: log.name,
              text: `${strength} correlation (r≈${r.toFixed(2)}): “${a}” and “${b}” ${dir}. ${tail}`.trim(),
              rank: corrRank(absR) + (tail ? 0.2 : 0),
            });
          } else if (
            Number.isFinite(r) &&
            absR >= 0.36 &&
            absR < 0.48 &&
            weakPairsThisLog < 2 &&
            Number.isFinite(agree) &&
            agree >= 0.74
          ) {
            pairSeen.add(pk);
            weakPairsThisLog++;
            lines.push({
              log: log.name,
              text: `Possible link (Pearson r≈${r.toFixed(
                2
              )}, modest): “${a}” vs “${b}” — step directions agree ~${(agree * 100).toFixed(
                0
              )}% of the time (nonlinear or noisy relationship; verify same sample clock).`,
              rank: 1.1,
            });
          } else if (
            Number.isFinite(r) &&
            absR < 0.48 &&
            absR >= 0.28 &&
            Number.isFinite(agree) &&
            agree >= 0.82 &&
            !pairSeen.has(pk)
          ) {
            pairSeen.add(pk);
            lines.push({
              log: log.name,
              text: `Step pattern: “${a}” and “${b}” move in the same direction ~${(agree * 100).toFixed(
                0
              )}% of steps while Pearson r≈${r.toFixed(
                2
              )} — worth eyeballing the chart for saturation, floors, or sensor clamping.`,
              rank: 0.9,
            });
          }
        }
      }

      const tempM = selectedMetrics.find((m) => metricSemanticClass(m) === "temp");
      const loadM = selectedMetrics.find((m) => metricSemanticClass(m) === "load");
      if (tempM && loadM) {
        const pair = alignedRowVectors(log, tempM, loadM);
        if (pair && pair.va.length >= 15) {
          const T = pair.va;
          const L = pair.vb;
          const meanL = L.reduce((s, x) => s + x, 0) / L.length;
          const stdL = Math.sqrt(L.reduce((s, x) => s + (x - meanL) ** 2, 0) / L.length) || 1;
          const meanT = T.reduce((s, x) => s + x, 0) / T.length;
          const stdT = Math.sqrt(T.reduce((s, x) => s + (x - meanT) ** 2, 0) / T.length) || 1;
          let spikes = 0;
          let co = 0;
          for (let k = 2; k < L.length - 2; k++) {
            const localMax =
              L[k] > L[k - 1] &&
              L[k] > L[k - 2] &&
              L[k] > L[k + 1] &&
              L[k] > L[k + 2];
            const highLoad = L[k] > meanL + 1.15 * stdL;
            if (localMax && highLoad) {
              spikes++;
              if (T[k] > meanT + 0.45 * stdT) co++;
            }
          }
          if (spikes >= 3 && co / spikes >= 0.55) {
            lines.push({
              log: log.name,
              text: `Burst pattern: ${co} of ${spikes} strong load peaks align with warmer samples — heat follows workload spikes (check sustained peaks vs cooler idle).`,
              rank: 1.5,
            });
          }
        }
      }

      const powerM = selectedMetrics.find((m) => metricSemanticClass(m) === "power");
      if (powerM && loadM) {
        const pairPl = alignedRowVectors(log, powerM, loadM);
        if (pairPl && pairPl.va.length >= 15) {
          const P = pairPl.va;
          const L2 = pairPl.vb;
          const meanP = P.reduce((s, x) => s + x, 0) / P.length;
          const stdP = Math.sqrt(P.reduce((s, x) => s + (x - meanP) ** 2, 0) / P.length) || 1;
          const meanL2 = L2.reduce((s, x) => s + x, 0) / L2.length;
          const stdL2 = Math.sqrt(L2.reduce((s, x) => s + (x - meanL2) ** 2, 0) / L2.length) || 1;
          let spikesP = 0;
          let coP = 0;
          for (let k = 2; k < L2.length - 2; k++) {
            const localMaxL =
              L2[k] > L2[k - 1] &&
              L2[k] > L2[k - 2] &&
              L2[k] > L2[k + 1] &&
              L2[k] > L2[k + 2];
            const highLoad2 = L2[k] > meanL2 + 1.1 * stdL2;
            if (localMaxL && highLoad2) {
              spikesP++;
              if (P[k] > meanP + 0.4 * stdP) coP++;
            }
          }
          if (spikesP >= 3 && coP / spikesP >= 0.5) {
            lines.push({
              log: log.name,
              text: `Burst pattern: ${coP} of ${spikesP} load spikes co-locate with higher “${powerM}” — useful when checking PSU headroom vs GPU transient draw.`,
              rank: 1.45,
            });
          }
        }
      }
    }

    lines.sort((a, b) => b.rank - a.rank);
    return lines.map(({ log, text }) => ({ log, text }));
  }

  /** Short label for matrix headers (full name in title attribute). */
  function metricAbbrForMatrix(name, max) {
    const s = String(name);
    const n = Math.max(4, max);
    if (s.length <= n) return s;
    return `${s.slice(0, n - 1)}…`;
  }

  /**
   * @param {{ parsed: ReturnType<typeof parseSensorCsv> | null, name: string }} log
   * @param {string} a
   * @param {string} b
   */
  function pearsonAlignedForLog(log, a, b) {
    if (!log.parsed) return null;
    const pair = alignedRowVectors(log, a, b);
    if (!pair) return null;
    const r = pearsonCorrelation(pair.va, pair.vb);
    return Number.isFinite(r) ? r : null;
  }

  /** @param {number | null} r */
  function corrMatrixCellClass(r) {
    if (r === null || Number.isNaN(r)) return "corr-matrix__cell corr-matrix__cell--na";
    const a = Math.abs(r);
    let base = "corr-matrix__cell corr-matrix__cell--na";
    if (a < 0.28) base = "corr-matrix__cell corr-matrix__cell--dim";
    else if (a < 0.48) base = "corr-matrix__cell corr-matrix__cell--mild";
    else if (a < 0.72) base = "corr-matrix__cell corr-matrix__cell--solid";
    else base = "corr-matrix__cell corr-matrix__cell--hot";
    return r < 0 ? `${base} corr-matrix__cell--neg` : base;
  }

  /**
   * HTML: one Pearson matrix per parsed log — easier to scan than a long pairwise list.
   * @param {{ id: string, name: string, parsed: ReturnType<typeof parseSensorCsv> | null }[]} logs
   * @param {string[]} selectedMetrics
   */
  function buildGpuCorrelationMatricesHtml(logs, selectedMetrics) {
    if (selectedMetrics.length < 2) return "";
    /** @type {string[]} */
    const blocks = [];
    for (const log of logs) {
      if (!log.parsed) continue;
      const N = selectedMetrics.length;
      const head = [`<th class="corr-matrix__corner" scope="col"></th>`]
        .concat(
          selectedMetrics.map((m) => {
            const ab = esc(metricAbbrForMatrix(m, 13));
            const full = esc(m);
            return `<th scope="col" class="corr-matrix__colhead" title="${full}">${ab}</th>`;
          })
        )
        .join("");
      const rows = [];
      for (let i = 0; i < N; i++) {
        const mi = selectedMetrics[i];
        const tds = [`<th scope="row" class="corr-matrix__rowhead" title="${esc(mi)}">${esc(metricAbbrForMatrix(mi, 20))}</th>`];
        for (let j = 0; j < N; j++) {
          if (i === j) {
            tds.push('<td class="corr-matrix__cell corr-matrix__cell--diag">—</td>');
          } else {
            const r = pearsonAlignedForLog(log, mi, selectedMetrics[j]);
            const txt = r === null ? "n/a" : r.toFixed(2);
            const tip = `${esc(mi)} · ${esc(selectedMetrics[j])}`;
            tds.push(`<td class="${corrMatrixCellClass(r)}" title="${tip}">${txt}</td>`);
          }
        }
        rows.push(`<tr>${tds.join("")}</tr>`);
      }
      blocks.push(`<section class="corr-log-block" aria-label="Correlation matrix: ${esc(log.name)}">
        <h5 class="corr-log-block__title">${esc(log.name)}</h5>
        <div class="corr-matrix-scroll" tabindex="0">
          <table class="corr-matrix">
            <thead><tr>${head}</tr></thead>
            <tbody>${rows.join("")}</tbody>
          </table>
        </div>
      </section>`);
    }
    if (!blocks.length && logs.length) {
      return `<p class="corr-matrix-fallback">No parsed sensor table in the loaded file(s) — use GPU-Z <strong>Sensor log to CSV / text</strong> exports so rows align.</p>`;
    }
    return blocks.join("");
  }

  /** @param {string | number | null | undefined} val */
  function csvEscapeField(val) {
    const s = val === null || val === undefined ? "" : String(val);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  /**
   * @param {string} filename
   * @param {string} text
   * @param {string} [mime]
   */
  function downloadTextAsFile(filename, text, mime) {
    const blob = new Blob([`\uFEFF${text}`], { type: mime || "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  /**
   * Long-format CSV (Excel-friendly): one row per sample × metric for pivot charts.
   * @param {{ name: string, parsed: ReturnType<typeof parseSensorCsv> | null }[]} logs
   * @param {number} maxRows
   * @returns {{ text: string, truncated: boolean }}
   */
  function buildGpuTimelineLongCsv(logs, maxRows) {
    const cap = Math.max(1000, maxRows || 80000);
    const header = ["log_file", "sample_index", "timestamp_raw", "timestamp_utc", "metric", "value", "unit"];
    const lines = [header.map(csvEscapeField).join(",")];
    let n = 0;
    let truncated = false;
    for (const log of logs) {
      if (!log.parsed) continue;
      const rows = log.parsed.rows;
      for (const col of log.parsed.numericCols) {
        if (col.index === 0) continue;
        for (const p of col.pts) {
          if (n >= cap) {
            truncated = true;
            return { text: lines.join("\r\n"), truncated };
          }
          const rawTime = (rows[p.r] && rows[p.r][0]) || "";
          const utc = p.t != null ? new Date(p.t).toISOString() : "";
          lines.push(
            [log.name, String(p.r + 1), rawTime, utc, col.name, String(p.v), col.unit || ""].map(csvEscapeField).join(",")
          );
          n++;
        }
      }
    }
    return { text: lines.join("\r\n"), truncated };
  }

  /**
   * @param {{ name: string, text: string }[]} logs
   */
  function buildGpuRawExportBundle(logs) {
    return logs.map((l) => `======== ${l.name} ========\n${l.text || ""}`).join("\n\n");
  }

  /**
   * Rule-based soft checks (not diagnosis).
   * @param {{ name: string, text: string, parsed: ReturnType<typeof parseSensorCsv> | null }[]} logs
   * @returns {{ level: "warn" | "info", text: string, log?: string }[]}
   */
  function buildGpuThresholdAlerts(logs) {
    /** @type {{ level: "warn" | "info", text: string, log?: string }[]} */
    const out = [];
    const seen = new Set();
    const add = (/** @type {"warn"|"info"} */ level, /** @type {string} */ text, /** @type {string} */ logName) => {
      const k = `${level}|${text}|${logName}`;
      if (seen.has(k)) return;
      seen.add(k);
      out.push({ level, text, log: logName });
    };

    for (const log of logs) {
      const t = log.text || "";
      if (!log.parsed) {
        add(
          "info",
          `Does not look like GPU-Z sensor CSV — use GPU-Z “Save sensor log” (text/CSV) for timeline export and charts.`,
          log.name
        );
        continue;
      }

      for (const col of log.parsed.numericCols) {
        if (col.index === 0) continue;
        if (metricSemanticClass(col.name) !== "temp") continue;
        if (col.max >= 90) {
          add(
            "warn",
            `Peak ${col.max.toFixed(1)}°C on “${col.name}” (threshold ≥90°C) — verify cooling, TIM, and case airflow; rule-based only.`,
            log.name
          );
        } else if (col.max >= 83) {
          add(
            "warn",
            `Peak ${col.max.toFixed(1)}°C on “${col.name}” (threshold ≥83°C) — worth checking fans and chassis flow.`,
            log.name
          );
        }
      }

      if (
        /pcie.*(error|corr|fatal|retain)|pci-e.*(error|corr)|\blane.*retrain|\baer\b.*(error|fatal)|uncorrectable.*(error|ecc)|correctable.*(ecc|error)|whea.*(error|logger)|replay\s*count|edac/i.test(
          t
        )
      ) {
        add(
          "warn",
          `Text matches PCIe / WHEA / error-style wording — review System events and physical link (riser, slot, cable) if this came from a broader export.`,
          log.name
        );
      }

      if (/thermal.*throttl|perf.*cap.*thermal|throttl.*(gpu|hot|temp)|temperature.*limit|hot[\s-]*spot.*limit/i.test(t)) {
        add(
          "info",
          `Thermal or performance-cap wording found — may reflect driver-reported limit reasons; compare with temperature and load columns.`,
          log.name
        );
      }

      if (/driver\s*version[\s:,]{0,24}(n\/a|n\/?a|unknown|—|\-\-|\?\?\?)/i.test(t)) {
        add("info", `Driver version may be missing or “N/A” in this snippet — confirm in GPU-Z if this is a validation report.`, log.name);
      }

      if (/nvidia|geforce|rtx|radeon|intel.*graphics/i.test(t) && /no\s*driver|driver\s*not\s*found|install.*gpu\s*driver/i.test(t)) {
        add("warn", `Possible missing-driver phrasing — install the vendor GPU driver if the system is new or after OS reinstall.`, log.name);
      }
    }
    return out;
  }

  /** @param {string[]} allMetrics @param {number} cap */
  function defaultMetricsPick(allMetrics, cap) {
    if (!allMetrics.length) return [];
    const score = (/** @type {string} */ name) => {
      const n = name.toLowerCase();
      let s = 0;
      if (/temp|°c/i.test(n)) s += 6;
      if (/load|util|usage/i.test(n)) s += 5;
      if (/power|watt/i.test(n)) s += 4;
      if (/clock|mhz|freq/i.test(n)) s += 3;
      if (/mem|volt/i.test(n)) s += 1;
      return s;
    };
    const sorted = [...allMetrics].sort((a, b) => score(b) - score(a));
    return sorted.slice(0, Math.min(cap, sorted.length));
  }

  /** @param {string} source */
  function prettyPrintXml(source) {
    const trimmed = source.replace(/^\uFEFF/, "").trimStart();
    if (!trimmed.startsWith("<")) return null;
    const r = parseMsInfoDocumentWithRecovery(source);
    if (!r.doc) return null;
    return serializePretty(r.doc.documentElement, 0);
  }

  /** @param {Element} el @param {number} depth */
  function serializePretty(el, depth) {
    const pad = "  ".repeat(depth);
    const name = el.tagName;
    const attrs = Array.from(el.attributes)
      .map((a) => ` ${a.name}="${escapeXmlAttr(a.value)}"`)
      .join("");
    const childElements = Array.from(el.childNodes).filter((n) => n.nodeType === Node.ELEMENT_NODE);
    const textNodes = Array.from(el.childNodes).filter(
      (n) => n.nodeType === Node.TEXT_NODE || n.nodeType === Node.CDATA_SECTION_NODE
    );
    const directText = textNodes
      .map((n) => n.textContent || "")
      .join("")
      .trim();
    if (!childElements.length) {
      if (!directText) return `${pad}<${name}${attrs}/>\n`;
      return `${pad}<${name}${attrs}>${escapeInner(directText)}</${name}>\n`;
    }
    let inner = "";
    for (const child of el.childNodes) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        inner += serializePretty(/** @type {Element} */ (child), depth + 1);
      } else if (child.nodeType === Node.TEXT_NODE) {
        const t = (child.textContent || "").trim();
        if (t) inner += `${pad}  ${escapeInner(t)}\n`;
      } else if (child.nodeType === Node.CDATA_SECTION_NODE) {
        inner += `${pad}  <![CDATA[${child.textContent}]]>\n`;
      }
    }
    return `${pad}<${name}${attrs}>\n${inner}${pad}</${name}>\n`;
  }

  /** @param {string} s */
  function escapeXmlAttr(s) {
    return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  }

  /** @param {string} s */
  function escapeInner(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  }

  function setupSystemPanel(panel) {
    const dropzone = panel.querySelector(".dropzone");
    const input = panel.querySelector(".file-input");
    const toolbarWrap = panel.querySelector(".system-toolbar-wrap");
    const meta = panel.querySelector(".file-meta");
    const encodingSelect = panel.querySelector(".encoding-select");
    const systemBody = panel.querySelector(".system-body");
    const summaryEl = panel.querySelector(".system-summary");
    const pre = panel.querySelector(".content--system");
    const btnClear = panel.querySelector(".btn-clear");
    const btnCopy = panel.querySelector(".btn-copy");
    const btnPretty = panel.querySelector(".btn-pretty");
    const searchInput = panel.querySelector(".system-raw-search");
    const searchClear = panel.querySelector(".system-search-clear");
    const searchClose = panel.querySelector(".system-search-close");
    const searchResults = panel.querySelector(".system-search-results");
    const searchResultsBody = panel.querySelector(".system-search-results__body");
    const rawPreWrap = panel.querySelector(".sys-section__content--raw .system-raw__pre-wrap");
    const btnCopyRepaired = panel.querySelector(".btn-copy-repaired");
    const btnMsiRawToggle = panel.querySelector(".btn-msi-raw-toggle");

    /** @type {{ name: string, buffer: ArrayBuffer, label: string, fileMetaBase: string, msiRepairedXml: string | null, msiOriginalDecoded: string, msiFixedRaw: string | null, msiViewOriginal: boolean } | null} */
    let state = null;
    /** @type {ReturnType<typeof setTimeout> | null} */
    let searchDebounce = null;

    function setVisible(loaded) {
      if (toolbarWrap) toolbarWrap.hidden = !loaded;
      if (systemBody) systemBody.hidden = !loaded;
      dropzone.style.display = loaded ? "none" : "";
    }

    /** @param {string} s */
    function escapeRegExp(s) {
      return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    /** @param {string} line @param {string} q */
    function highlightSearchLine(line, q) {
      if (!q) return escapeInner(line);
      const re = new RegExp(`(${escapeRegExp(q)})`, "gi");
      return escapeInner(line).replace(re, "<mark>$1</mark>");
    }

    function performRawSearch(q) {
      if (!searchResults || !searchResultsBody || !pre) return;
      const query = (q || "").trim();
      if (!query) {
        searchResults.hidden = true;
        searchResultsBody.innerHTML = "";
        if (searchClear) searchClear.hidden = true;
        return;
      }
      if (searchClear) searchClear.hidden = false;
      const text = pre.textContent || "";
      const lines = text.split("\n");
      const ql = query.toLowerCase();
      /** @type {{ n: number, line: string }[]} */
      const hits = [];
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(ql)) {
          hits.push({ n: i + 1, line: lines[i] });
          if (hits.length >= 80) break;
        }
      }
      if (hits.length === 0) {
        searchResults.hidden = false;
        searchResultsBody.innerHTML = `<div class="system-search-empty">No matches for “${escapeInner(query)}”.</div>`;
        return;
      }
      searchResults.hidden = false;
      searchResultsBody.innerHTML = hits
        .map(
          (h) =>
            `<button type="button" class="system-search-hit" data-line="${h.n}"><div class="system-search-hit__line">Line ${h.n}</div><div class="system-search-hit__text">${highlightSearchLine(h.line, query)}</div></button>`
        )
        .join("");
      searchResultsBody.querySelectorAll(".system-search-hit").forEach((btn) => {
        btn.addEventListener("click", () => {
          const lineNum = parseInt(btn.getAttribute("data-line") || "0", 10);
          scrollRawToLine(lineNum);
        });
      });
    }

    /** @param {number} lineNum */
    function scrollRawToLine(lineNum) {
      const wrap = rawPreWrap || pre?.parentElement;
      if (!pre || !wrap || lineNum < 1) return;
      const lh = parseFloat(getComputedStyle(pre).lineHeight);
      const lineHeight = Number.isFinite(lh) && lh > 0 ? lh : 16;
      const paddingTop = parseFloat(getComputedStyle(pre).paddingTop) || 0;
      const target = Math.max(0, (lineNum - 1) * lineHeight + paddingTop - wrap.clientHeight / 3);
      wrap.scrollTo({ top: target, behavior: "smooth" });
      const rawDetails = panel.querySelector(".sys-section__content--raw")?.closest("details");
      if (rawDetails && !rawDetails.open) rawDetails.open = true;
    }

    function syncRawPreFromState() {
      if (!state || !pre) return;
      const orig = state.msiOriginalDecoded;
      const fixed = state.msiFixedRaw;
      if (fixed && state.msiViewOriginal) {
        pre.textContent = orig;
      } else {
        pre.textContent = fixed || orig;
      }
      if (btnMsiRawToggle) {
        const dual = !!fixed && fixed !== orig;
        btnMsiRawToggle.hidden = !dual;
        btnMsiRawToggle.textContent = state.msiViewOriginal ? "Show repaired text" : "Show original file";
      }
      if (meta && state.fileMetaBase) {
        meta.textContent =
          state.fileMetaBase +
          (state.msiFixedRaw ? (state.msiViewOriginal ? " · viewing original" : " · showing repaired text") : "");
      }
    }

    function applyDecode() {
      if (!state || !pre || !summaryEl) return;
      const enc = encodingSelect.value;
      const { text, label } = decodeBuffer(state.buffer, "system", enc);
      state.label = label;
      state.msiOriginalDecoded = text;
      const recovery = parseMsInfoDocumentWithRecovery(text);
      const display = recovery.rawDisplayText != null ? recovery.rawDisplayText : text;
      state.msiFixedRaw = display !== text ? display : null;
      state.msiViewOriginal = false;
      state.msiRepairedXml =
        recovery.repairedText ||
        (recovery.doc ? /** @type {any} */ (recovery.doc)._msinfoFixedSource : null) ||
        state.msiFixedRaw ||
        null;
      if (btnCopyRepaired) btnCopyRepaired.hidden = !state.msiRepairedXml;
      state.fileMetaBase = `${state.name} · ${(state.buffer.byteLength / 1024).toFixed(1)} KiB · ${label}`;
      syncRawPreFromState();

      /** @type {{ kvs: { path: string, item: string, value: string }[], rows: { path: string, fields: Record<string, string> }[] } | null} */
      let data = null;
      if (recovery.doc) data = walkMsInfo(recovery.doc);
      else if (recovery.data && recovery.data.kvs.length) data = recovery.data;

      const xmlRep =
        recovery.doc && Array.isArray(/** @type {any} */ (recovery.doc)._msinfoRepairs)
          ? /** @type {any} */ (recovery.doc)._msinfoRepairs
          : [];
      if (data) {
        const sum = extractSystemSummary(data);
        renderSystemSummary(summaryEl, sum, true, recovery.notes, xmlRep);
      } else {
        renderSystemSummary(summaryEl, null, false, recovery.notes, xmlRep);
      }
      if (searchInput && searchInput.value.trim()) performRawSearch(searchInput.value);
    }

    function loadFile(file) {
      const reader = new FileReader();
      reader.onload = () => {
        const buffer = reader.result;
        if (!(buffer instanceof ArrayBuffer)) return;
        state = {
          name: file.name,
          buffer,
          label: "",
          fileMetaBase: "",
          msiRepairedXml: null,
          msiOriginalDecoded: "",
          msiFixedRaw: null,
          msiViewOriginal: false,
        };
        encodingSelect.value = "auto";
        setVisible(true);
        applyDecode();
      };
      reader.readAsArrayBuffer(file);
    }

    function preventDefaults(e) {
      e.preventDefault();
      e.stopPropagation();
    }
    ["dragenter", "dragover", "dragleave", "drop"].forEach((ev) => {
      dropzone.addEventListener(ev, preventDefaults);
    });
    dropzone.addEventListener("dragenter", () => dropzone.classList.add("is-dragover"));
    dropzone.addEventListener("dragleave", () => dropzone.classList.remove("is-dragover"));
    dropzone.addEventListener("dragover", () => dropzone.classList.add("is-dragover"));
    dropzone.addEventListener("drop", (e) => {
      dropzone.classList.remove("is-dragover");
      const dt = e.dataTransfer;
      if (!dt || !dt.files.length) return;
      loadFile(dt.files[0]);
    });
    input.addEventListener("change", () => {
      const f = input.files && input.files[0];
      if (f) loadFile(f);
      input.value = "";
    });
    dropzone.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        input.click();
      }
    });
    encodingSelect.addEventListener("change", () => applyDecode());
    if (summaryEl) {
      summaryEl.addEventListener(
        "click",
        (e) => {
          const btn = e.target.closest(".report-category__translate");
          if (!btn || !summaryEl.contains(btn)) return;
          e.preventDefault();
          e.stopPropagation();
          const det = btn.closest("details");
          const root = det && det.querySelector(".report-category__i18n-root");
          if (!root) return;
          const pressed = btn.getAttribute("aria-pressed") === "true";
          const showEn = !pressed;
          btn.setAttribute("aria-pressed", showEn ? "true" : "false");
          btn.textContent = showEn ? "Original" : "Translate";
          root.querySelectorAll(".sum-i18n").forEach((span) => {
            const enc = span.getAttribute("data-i18n-enc");
            let raw = "";
            if (enc) {
              try {
                raw = decodeURIComponent(enc);
              } catch {
                raw = span.getAttribute("data-export") || "";
              }
            } else {
              raw = span.getAttribute("data-export") || "";
            }
            span.textContent = showEn ? translateExportValueToEnglish(raw) : raw;
          });
        },
        true
      );
    }
    if (searchInput) {
      searchInput.addEventListener("input", () => {
        if (searchDebounce) clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => performRawSearch(searchInput.value), 220);
      });
    }
    if (searchClear) {
      searchClear.addEventListener("click", () => {
        if (searchInput) searchInput.value = "";
        performRawSearch("");
      });
    }
    if (searchClose) {
      searchClose.addEventListener("click", () => {
        if (searchInput) searchInput.value = "";
        performRawSearch("");
        if (searchResults) searchResults.hidden = true;
      });
    }
    btnClear.addEventListener("click", () => {
      state = null;
      if (pre) pre.textContent = "";
      if (summaryEl) summaryEl.innerHTML = "";
      if (btnCopyRepaired) btnCopyRepaired.hidden = true;
      if (btnMsiRawToggle) btnMsiRawToggle.hidden = true;
      meta.textContent = "";
      if (searchInput) searchInput.value = "";
      performRawSearch("");
      if (searchResults) searchResults.hidden = true;
      setVisible(false);
    });
    btnCopy.addEventListener("click", async () => {
      const t = pre?.textContent || "";
      if (!t) return;
      try {
        await navigator.clipboard.writeText(t);
        btnCopy.textContent = "Copied";
        setTimeout(() => {
          btnCopy.textContent = "Copy raw";
        }, 1200);
      } catch {
        window.prompt("Copy:", t);
      }
    });
    if (btnCopyRepaired) {
      btnCopyRepaired.addEventListener("click", async () => {
        const t = state?.msiRepairedXml || "";
        if (!t) return;
        try {
          await navigator.clipboard.writeText(t);
          btnCopyRepaired.textContent = "Copied";
          setTimeout(() => {
            btnCopyRepaired.textContent = "Copy repaired XML";
          }, 1400);
        } catch {
          window.prompt("Copy repaired XML:", t);
        }
      });
    }
    if (btnMsiRawToggle) {
      btnMsiRawToggle.addEventListener("click", () => {
        if (!state) return;
        state.msiViewOriginal = !state.msiViewOriginal;
        syncRawPreFromState();
        if (searchInput && searchInput.value.trim()) performRawSearch(searchInput.value);
      });
    }
    btnPretty.addEventListener("click", () => {
      const src = pre?.textContent || "";
      const out = prettyPrintXml(src);
      if (!out) {
        window.alert("Could not parse as XML. This file may not be MSInfo-style XML.");
        return;
      }
      if (pre) pre.textContent = out;
      if (state) {
        meta.textContent = `${state.name} · ${(state.buffer.byteLength / 1024).toFixed(1)} KiB · pretty XML`;
      }
      if (searchInput && searchInput.value.trim()) performRawSearch(searchInput.value);
    });
  }

  function setupGpuAnalyzer(panel) {
    const MAX_METRIC_CHARTS = 12;
    const dropzone = panel.querySelector(".dropzone--multi");
    const input = panel.querySelector(".file-input--multi");
    const toolbar = panel.querySelector(".analyzer-toolbar");
    const meta = panel.querySelector(".analyzer-meta");
    const chipsEl = panel.querySelector(".analyzer-chips");
    const controls = panel.querySelector(".analyzer-controls");
    const metricCheckboxesHost = panel.querySelector(".metric-checkboxes");
    const togglePeaks = panel.querySelector(".toggle-peaks");
    const toggleInsights = panel.querySelector(".toggle-insights");
    const chartWrap = panel.querySelector(".analyzer-chart-wrap");
    const chartsHost = panel.querySelector(".analyzer-charts");
    const axisNote = panel.querySelector(".chart-axis-note");
    const insightsEl = panel.querySelector(".analyzer-insights");
    const statsEl = panel.querySelector(".analyzer-stats");
    const alertsEl = panel.querySelector(".analyzer-alerts");
    const btnClearAll = panel.querySelector(".btn-clear-all");
    const btnExportCsv = panel.querySelector(".btn-gpu-export-csv");
    const btnExportRaw = panel.querySelector(".btn-gpu-export-raw");

    /** @type {{ id: string, name: string, buffer: ArrayBuffer, label: string, text: string, parsed: ReturnType<typeof parseSensorCsv> | null }[]} */
    let logs = [];
    let nextId = 1;
    /** @type {string[] | null} */
    let savedMetricPick = null;

    function setAnalyzerVisible(hasLogs) {
      toolbar.hidden = !hasLogs;
      chipsEl.hidden = !hasLogs;
      controls.hidden = !hasLogs;
      chartWrap.hidden = !hasLogs;
      statsEl.hidden = !hasLogs;
      if (insightsEl) insightsEl.hidden = !hasLogs;
      dropzone.classList.toggle("dropzone--stacked", hasLogs);
    }

    function unionMetrics() {
      const set = new Map();
      for (const log of logs) {
        if (!log.parsed) continue;
        for (const col of log.parsed.numericCols) {
          if (col.index === 0) continue;
          const key = normalizeHeader(col.name);
          if (!set.has(key)) set.set(key, col.name);
        }
      }
      return [...set.values()].sort((a, b) => a.localeCompare(b));
    }

    function getSelectedMetricsFromUi() {
      if (!metricCheckboxesHost) return [];
      return [
        ...metricCheckboxesHost.querySelectorAll("input[type=checkbox]:checked"),
      ].map((el) => /** @type {HTMLInputElement} */ (el).value);
    }

    function refreshMetricCheckboxes() {
      if (!metricCheckboxesHost) return;
      const metrics = unionMetrics();
      const prev = savedMetricPick?.filter((m) => metrics.includes(m)) ?? [];
      let initial =
        prev.length > 0 ? prev.slice(0, MAX_METRIC_CHARTS) : defaultMetricsPick(metrics, 3);
      if (!initial.length && metrics.length) {
        initial = metrics.slice(0, Math.min(2, metrics.length));
      }
      const initialSet = new Set(initial);
      metricCheckboxesHost.innerHTML = "";
      metrics.forEach((m, mi) => {
        const label = document.createElement("label");
        label.className = "metric-check-label";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.value = m;
        cb.id = `gpu-metric-cb-${mi}`;
        cb.checked = initialSet.has(m);
        const span = document.createElement("span");
        span.textContent = m;
        span.title = m;
        label.appendChild(cb);
        label.appendChild(span);
        metricCheckboxesHost.appendChild(label);
        cb.addEventListener("change", () => {
          const nChecked = metricCheckboxesHost.querySelectorAll("input:checked").length;
          if (nChecked > MAX_METRIC_CHARTS) {
            cb.checked = false;
            return;
          }
          savedMetricPick = getSelectedMetricsFromUi();
          redraw();
        });
      });
      savedMetricPick = getSelectedMetricsFromUi();
    }

    function buildSeriesForMetric(metricName) {
      if (!metricName) return [];
      /** @type {{ label: string, color: string, unit: string, pts: { x: number, y: number }[], minY: number, maxY: number, minPt: { x: number, y: number }, maxPt: { x: number, y: number } }[]} */
      const out = [];
      logs.forEach((log, li) => {
        if (!log.parsed) return;
        const colIdx = columnIndexForMetric(log.parsed.headers, metricName);
        if (colIdx < 0) return;
        const col = log.parsed.numericCols.find((c) => c.index === colIdx);
        if (!col) return;
        const timesOk = col.pts.filter((p) => p.t != null).length / col.pts.length;
        const useTime = timesOk >= 0.7;
        /** @type {{ x: number, y: number }[]} */
        const pts = [];
        for (const p of col.pts) {
          const x = useTime && p.t != null ? p.t : p.r;
          pts.push({ x, y: p.v });
        }
        if (pts.length < 2) return;
        let minI = 0;
        let maxI = 0;
        for (let i = 1; i < pts.length; i++) {
          if (pts[i].y < pts[minI].y) minI = i;
          if (pts[i].y > pts[maxI].y) maxI = i;
        }
        out.push({
          label: log.name,
          color: CHART_COLORS[li % CHART_COLORS.length],
          unit: col.unit,
          pts,
          minY: Math.min(...pts.map((p) => p.y)),
          maxY: Math.max(...pts.map((p) => p.y)),
          minPt: pts[minI],
          maxPt: pts[maxI],
        });
      });
      return out;
    }

    function renderStatsAll(selected) {
      if (!statsEl) return;
      if (!selected.length) {
        statsEl.innerHTML = '<p class="summary-empty">Select at least one metric above.</p>';
        return;
      }
      let html = "";
      for (const metricName of selected) {
        const series = buildSeriesForMetric(metricName);
        html += `<h4 class="stats-metric-title">${esc(metricName)}</h4>`;
        if (!series.length) {
          html += '<p class="summary-empty">No numeric data for this metric across loaded logs.</p>';
          continue;
        }
        html += `<div class="stats-table-wrap"><table class="stats-table"><thead><tr><th>Log</th><th>Min</th><th>Max</th><th>Range (Δ)</th><th>First</th><th>Last</th><th>Δ end</th></tr></thead><tbody>`;
        for (const s of series) {
          const u = s.unit ? ` ${s.unit}` : "";
          const first = s.pts[0].y;
          const last = s.pts[s.pts.length - 1].y;
          const range = s.maxY - s.minY;
          const deltaEnd = last - first;
          const up = deltaEnd > 0;
          const cls = deltaEnd === 0 ? "" : up ? "stats-delta-up" : "stats-delta-down";
          const arrow = deltaEnd === 0 ? "" : up ? " ↑" : " ↓";
          html += `<tr>
          <td style="color:${s.color}">${esc(s.label)}</td>
          <td>${s.minY.toFixed(2)}${u}</td>
          <td>${s.maxY.toFixed(2)}${u}</td>
          <td>${range.toFixed(2)}${u}</td>
          <td>${first.toFixed(2)}${u}</td>
          <td>${last.toFixed(2)}${u}</td>
          <td class="${cls}">${deltaEnd > 0 ? "+" : ""}${deltaEnd.toFixed(2)}${u}${arrow}</td>
        </tr>`;
        }
        html += "</tbody></table></div>";
      }
      statsEl.innerHTML = html;
    }

    function renderInsightsPanel(selected) {
      if (!insightsEl) return;
      if (!logs.length) {
        insightsEl.innerHTML = "";
        insightsEl.hidden = true;
        return;
      }
      if (!toggleInsights?.checked) {
        insightsEl.innerHTML = "";
        insightsEl.hidden = true;
        return;
      }
      insightsEl.hidden = false;
      const foot = `<p class="insight-disclaimer">Same-row Pearson r as the charts in this panel (timestamps on X when parsed; matrix uses aligned rows). Narrative lines include bursts / step-pattern hints. Not a diagnosis.</p>`;
      if (selected.length < 2) {
        insightsEl.innerHTML = `<h4>Correlation &amp; patterns</h4><p class="insights-lead">Pick <strong>two or more</strong> metrics to see a color matrix (per log) plus optional narrative notes.</p><p class="insight-disclaimer">Metrics must share the same sensor sample rows.</p>`;
        return;
      }
      const matrixHtml = buildGpuCorrelationMatricesHtml(logs, selected);
      const lines = buildGpuInsightLines(logs, selected);
      const legend = `<div class="corr-matrix-legend" aria-hidden="true">
        <span class="corr-matrix-legend__item"><span class="corr-matrix-legend__sw corr-matrix-legend__sw--dim"></span> |r|&lt;0.28</span>
        <span class="corr-matrix-legend__item"><span class="corr-matrix-legend__sw corr-matrix-legend__sw--mild"></span> 0.28–0.48</span>
        <span class="corr-matrix-legend__item"><span class="corr-matrix-legend__sw corr-matrix-legend__sw--solid"></span> 0.48–0.72</span>
        <span class="corr-matrix-legend__item"><span class="corr-matrix-legend__sw corr-matrix-legend__sw--hot"></span> ≥0.72</span>
        <span class="corr-matrix-legend__item"><span class="corr-matrix-legend__sw corr-matrix-legend__sw--neg"></span> negative r</span>
      </div>`;
      let body = `<h4>Correlation &amp; patterns</h4>
<p class="insights-lead">At-a-glance <strong>Pearson r</strong> between every selected pair (per log). Charts for the same metrics are in the <strong>grid below</strong> — scroll one region to compare.</p>`;
      if (matrixHtml) {
        body += `<div class="insights-matrix-bundle">${matrixHtml}${legend}</div>`;
      }
      if (lines.length) {
        const cap = 8;
        const slice = lines.slice(0, cap);
        const li = slice.map((l) => `<li><strong>${esc(l.log)}</strong> — ${esc(l.text)}</li>`).join("");
        const more =
          lines.length > cap
            ? `<p class="insight-disclaimer">Showing ${cap} of ${lines.length} narrative lines (strongest first).</p>`
            : "";
        body += `<details class="insight-narrative"><summary>Narrative &amp; burst notes (${lines.length})</summary><ul class="insight-narrative__ul">${li}</ul>${more}</details>`;
      } else if (!matrixHtml) {
        body += `<p class="insights-lead">No matrix and no strong narrative hits — try metrics that co-move (temp + load, power + clock) or confirm the log has enough aligned samples.</p><ul class="insight-hints"><li>Idle captures flatten correlations.</li><li>Ensure columns share one timebase in the export.</li></ul>`;
      } else {
        body += `<p class="insights-lead subtle">No extra burst / step-pattern lines beyond the matrix — relationships are mostly modest for this pick.</p>`;
      }
      insightsEl.innerHTML = body + foot;
    }

    function renderGpuAlerts() {
      if (!alertsEl) return;
      if (!logs.length) {
        alertsEl.hidden = true;
        alertsEl.innerHTML = "";
        return;
      }
      const alerts = buildGpuThresholdAlerts(logs);
      if (!alerts.length) {
        alertsEl.hidden = true;
        alertsEl.innerHTML = "";
        return;
      }
      alertsEl.hidden = false;
      const lis = alerts
        .map((a) => {
          const cls = a.level === "warn" ? "analyzer-alerts__item--warn" : "analyzer-alerts__item--info";
          const who = a.log ? `<strong class="analyzer-alerts__log">${esc(a.log)}</strong> — ` : "";
          return `<li class="analyzer-alerts__item ${cls}">${who}${esc(a.text)}</li>`;
        })
        .join("");
      alertsEl.innerHTML = `<h4 class="analyzer-alerts__title">Soft checks (rule-based)</h4><ul class="analyzer-alerts__list">${lis}</ul><p class="insight-disclaimer">Heuristic thresholds and text patterns only — not a diagnosis. Nothing here uploads your files.</p>`;
    }

    function redraw() {
      if (!chartsHost || !axisNote) return;
      const selected = getSelectedMetricsFromUi();
      savedMetricPick = selected;
      chartsHost.innerHTML = "";
      const showPeaks = togglePeaks?.checked ?? true;
      if (!selected.length) {
        axisNote.textContent =
          "Select up to twelve metrics. Each metric opens in its own tall row with a separate Y scale; log files share colors (see chips above).";
        renderStatsAll([]);
        renderInsightsPanel([]);
        renderGpuAlerts();
        return;
      }
      for (const metric of selected) {
        const series = buildSeriesForMetric(metric);
        const block = document.createElement("div");
        block.className = "analyzer-chart-block";
        const h = document.createElement("h3");
        h.className = "analyzer-chart-block__title";
        h.textContent = metric;
        const wrap = document.createElement("div");
        wrap.className = "chart-canvas-wrap chart-canvas-wrap--metric";
        const c = document.createElement("canvas");
        c.className = "analyzer-metric-canvas";
        c.setAttribute("aria-label", `Sensor comparison: ${metric}`);
        wrap.appendChild(c);
        block.appendChild(h);
        block.appendChild(wrap);
        chartsHost.appendChild(block);
        drawComparisonChart(c, series, showPeaks);
      }
      axisNote.textContent = `${selected.length} chart${
        selected.length === 1 ? "" : "s"
      }, one per row at full width — same metric order as the correlation matrix above. Each chart has its own Y scale. X = time when ≥70% of samples parse dates from column 0; otherwise row index. Peaks ▲ / valleys ▼ when enabled.`;
      renderStatsAll(selected);
      renderInsightsPanel(selected);
      renderGpuAlerts();
    }

    function renderChips() {
      if (!chipsEl) return;
      chipsEl.innerHTML = "";
      logs.forEach((log, i) => {
        const chip = document.createElement("span");
        chip.className = "log-chip";
        chip.innerHTML = `<span class="log-chip__dot" style="background:${CHART_COLORS[i % CHART_COLORS.length]}"></span>
          <span>${esc(log.name)}</span>
          <button type="button" class="log-chip__remove" aria-label="Remove ${esc(log.name)}">×</button>`;
        const btn = chip.querySelector(".log-chip__remove");
        btn?.addEventListener("click", () => {
          logs = logs.filter((l) => l.id !== log.id);
          syncUi();
        });
        chipsEl.appendChild(chip);
      });
    }

    function syncUi() {
      const n = logs.length;
      meta.textContent = n
        ? `${n} log${n === 1 ? "" : "s"} · charts, CSV export, raw bundle, correlation & soft checks`
        : "";
      setAnalyzerVisible(n > 0);
      renderChips();
      if (n > 0) {
        if (metricCheckboxesHost?.querySelector("input")) {
          savedMetricPick = getSelectedMetricsFromUi();
        }
        refreshMetricCheckboxes();
      } else {
        savedMetricPick = null;
        if (metricCheckboxesHost) metricCheckboxesHost.innerHTML = "";
      }
      redraw();
    }

    function addFiles(fileList) {
      const files = [...fileList];
      if (!files.length) return;
      let pending = files.length;
      for (const file of files) {
        const id = `log-${nextId++}`;
        const name = file.name;
        const reader = new FileReader();
        reader.onload = () => {
          const buffer = reader.result;
          if (buffer instanceof ArrayBuffer) {
            const { text, label } = decodeBuffer(buffer, "gpu", "auto");
            const parsed = parseSensorCsv(text);
            logs.push({ id, name, buffer, label, text, parsed });
          }
          pending -= 1;
          if (pending === 0) syncUi();
        };
        reader.readAsArrayBuffer(file);
      }
    }

    function preventDefaults(e) {
      e.preventDefault();
      e.stopPropagation();
    }
    ["dragenter", "dragover", "dragleave", "drop"].forEach((ev) => {
      dropzone.addEventListener(ev, preventDefaults);
    });
    dropzone.addEventListener("dragenter", () => dropzone.classList.add("is-dragover"));
    dropzone.addEventListener("dragleave", () => dropzone.classList.remove("is-dragover"));
    dropzone.addEventListener("dragover", () => dropzone.classList.add("is-dragover"));
    dropzone.addEventListener("drop", (e) => {
      dropzone.classList.remove("is-dragover");
      const dt = e.dataTransfer;
      if (!dt?.files?.length) return;
      addFiles(dt.files);
    });
    input.addEventListener("change", () => {
      if (input.files?.length) addFiles(input.files);
      input.value = "";
    });
    dropzone.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        input.click();
      }
    });
    togglePeaks?.addEventListener("change", () => redraw());
    toggleInsights?.addEventListener("change", () => redraw());
    btnExportCsv?.addEventListener("click", () => {
      if (!logs.length) return;
      const parsedAny = logs.some((l) => l.parsed && l.parsed.numericCols.some((c) => c.index !== 0));
      if (!parsedAny) {
        window.alert("No sensor CSV tables found in loaded logs. Export a sensor log from GPU-Z as text/CSV, then add it again.");
        return;
      }
      const { text, truncated } = buildGpuTimelineLongCsv(logs, 80000);
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      downloadTextAsFile(`gpu-sensor-timeline-${stamp}.csv`, text, "text/csv;charset=utf-8");
      if (truncated) {
        window.alert(
          "Export hit the 80,000-row cap (one row per metric sample). Remove a log or split the capture to export everything."
        );
      }
    });
    btnExportRaw?.addEventListener("click", () => {
      if (!logs.length) return;
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      downloadTextAsFile(`gpu-logs-raw-${stamp}.txt`, buildGpuRawExportBundle(logs), "text/plain;charset=utf-8");
    });
    btnClearAll?.addEventListener("click", () => {
      logs = [];
      syncUi();
    });
    window.addEventListener("resize", () => {
      if (logs.length) redraw();
    });
    panel.addEventListener("gpuresize", () => {
      if (logs.length) redraw();
    });
  }

  /** Tabs use URL hash + CSS :target (links in HTML). This syncs legacy hashes, ARIA, and GPU chart resize. */
  function setupWorkspaceTabs() {
    const root = document.getElementById("workspace");
    if (!root) return;
    const TAB_HREFS = ["#tool-panel-system", "#tool-panel-bsod", "#tool-panel-gpu"];
    const LEGACY = { "#system": "#tool-panel-system", "#bsod": "#tool-panel-bsod", "#gpu": "#tool-panel-gpu" };

    /** @returns {string} */
    function canonicalPanelHash() {
      const raw = (location.hash || "#tool-panel-system").split("?")[0].toLowerCase();
      const mapped = LEGACY[raw] || raw;
      return TAB_HREFS.includes(mapped) ? mapped : "#tool-panel-system";
    }

    function replaceHashIfNeeded() {
      const want = canonicalPanelHash();
      if ((location.hash || "").toLowerCase() !== want) {
        try {
          history.replaceState(null, "", want);
        } catch {
          /* file:// or restricted */
        }
      }
    }

    function syncTabAria() {
      const active = canonicalPanelHash();
      root.querySelectorAll("a.tool-tab[href]").forEach((el) => {
        const a = /** @type {HTMLAnchorElement} */ (el);
        const on = (a.getAttribute("href") || "").toLowerCase() === active;
        a.setAttribute("aria-selected", on ? "true" : "false");
        a.tabIndex = on ? 0 : -1;
      });
    }

    function onWorkspaceHash() {
      replaceHashIfNeeded();
      syncTabAria();
      if (canonicalPanelHash() === "#tool-panel-gpu") {
        document.querySelector(".panel--gpu")?.dispatchEvent(new CustomEvent("gpuresize", { bubbles: false }));
      }
    }

    window.addEventListener("hashchange", onWorkspaceHash);

    /** Default fragment navigation scrolls the active panel into view — undo so tabs feel in-place. */
    function preserveScrollForTabClicks() {
      root.querySelectorAll("a.tool-tab[href]").forEach((el) => {
        el.addEventListener(
          "click",
          () => {
            const y = window.scrollY;
            const freeze = () => {
              window.scrollTo(0, y);
            };
            queueMicrotask(freeze);
            requestAnimationFrame(freeze);
            requestAnimationFrame(() => {
              requestAnimationFrame(freeze);
            });
            setTimeout(freeze, 0);
          },
          true
        );
      });
    }
    preserveScrollForTabClicks();

    /** <kbd>Shift</kbd>+1 / 2 / 3 — switch tools (uses <code>code</code> so <kbd>!</kbd>/<kbd>@</kbd>/<kbd>#</kbd> layouts still map to digits; skipped in fields and while About dialog is open). */
    document.addEventListener("keydown", (e) => {
      if (!e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
      const digit = e.code === "Digit1" ? 1 : e.code === "Digit2" ? 2 : e.code === "Digit3" ? 3 : 0;
      if (!digit) return;
      const t = /** @type {HTMLElement | null} */ (e.target);
      if (t?.closest("input, textarea, select, [contenteditable=true]")) return;
      const aboutDlg = document.getElementById("about-dialog");
      if (aboutDlg instanceof HTMLDialogElement && aboutDlg.open) return;
      e.preventDefault();
      const tabs = [...root.querySelectorAll("a.tool-tab[href]")];
      const tab = tabs[digit - 1];
      if (tab instanceof HTMLAnchorElement) tab.click();
    });

    root.addEventListener("keydown", (e) => {
      const el = /** @type {HTMLElement | null} */ (e.target);
      if (!el || !el.classList.contains("tool-tab")) return;
      const tabs = [...root.querySelectorAll("a.tool-tab[href]")];
      const i = tabs.indexOf(el);
      if (i < 0) return;
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        const dir = e.key === "ArrowRight" ? 1 : -1;
        const next = tabs[(i + dir + tabs.length) % tabs.length];
        if (next instanceof HTMLAnchorElement) next.click();
      } else if (e.key === "Home") {
        e.preventDefault();
        tabs[0]?.click();
      } else if (e.key === "End") {
        e.preventDefault();
        tabs[tabs.length - 1]?.click();
      }
    });

    onWorkspaceHash();
  }

  /** After “Skip to tools”, move keyboard focus into <main> for screen-reader / tab order. */
  function setupSkipLinkFocus() {
    document.querySelector(".skip-link")?.addEventListener("click", () => {
      queueMicrotask(() => document.getElementById("workspace")?.focus());
    });
  }

  /** About modal, version string, and <kbd>Shift</kbd>+<kbd>?</kbd> (<kbd>Shift</kbd>+<kbd>/</kbd>) shortcut (skipped in form fields). */
  function setupAboutDialog() {
    const dlg = document.getElementById("about-dialog");
    const openBtn = document.getElementById("about-dialog-open");
    const verEl = document.getElementById("app-version");
    const verInDlg = document.getElementById("about-dialog-version");

    if (verEl) verEl.textContent = `v${APP_VERSION}`;
    if (verInDlg) verInDlg.textContent = APP_VERSION;

    openBtn?.addEventListener("click", () => {
      if (dlg instanceof HTMLDialogElement) dlg.showModal();
    });

    /** Every control with <code>data-about-close</code> (header × and footer Close) must close — <code>querySelector</code> only hit the first. */
    dlg?.addEventListener("click", (e) => {
      const t = /** @type {HTMLElement | null} */ (e.target);
      if (!t?.closest("[data-about-close]")) return;
      if (dlg instanceof HTMLDialogElement) dlg.close();
    });

    document.addEventListener("keydown", (e) => {
      const slashWithShift = e.shiftKey && e.code === "Slash" && !e.ctrlKey && !e.metaKey && !e.altKey;
      const questionWithShift = e.shiftKey && e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey;
      if (!slashWithShift && !questionWithShift) return;
      const t = /** @type {HTMLElement | null} */ (e.target);
      if (t?.closest("input, textarea, select, [contenteditable=true]")) return;
      e.preventDefault();
      if (dlg instanceof HTMLDialogElement) dlg.showModal();
    });
  }

  document.querySelectorAll(".panel--system").forEach((p) => {
    try {
      setupSystemPanel(p);
    } catch (err) {
      console.error("System panel init failed:", err);
    }
  });
  document.querySelectorAll(".panel--bsod").forEach((p) => {
    try {
      setupBsodPanel(p);
    } catch (err) {
      console.error("BSOD panel init failed:", err);
    }
  });
  document.querySelectorAll(".panel--gpu").forEach((p) => {
    try {
      setupGpuAnalyzer(p);
    } catch (err) {
      console.error("GPU panel init failed:", err);
    }
  });
  setupWorkspaceTabs();
  setupSkipLinkFocus();
  setupAboutDialog();
})();
