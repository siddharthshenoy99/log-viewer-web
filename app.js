(function () {
  "use strict";

  /** Bump when you ship a handoff ZIP or tag a review build (footer + About dialog). */
  const APP_VERSION = "1.6.3";

  /** Show determinate progress for reads / decodes above this size (system .nfo, Event Viewer). */
  const LARGE_FILE_PROGRESS_THRESHOLD = 380 * 1024;

  /**
   * Beyond this decoded character count, building a full MSInfo XML DOM often freezes the tab or exceeds browser
   * heap limits. {@link parseMsInfoDocumentWithRecovery} prefers a linear scan instead.
   */
  const MSINFO_DOM_SAFE_MAX_CHARS = 6_000_000;

  function yieldToMain() {
    return new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }

  /**
   * @param {File} file
   * @param {AbortSignal} signal
   * @param {(fraction: number) => void} onProgress 0..1 while reading
   */
  async function readFileAsArrayBufferWithProgress(file, signal, onProgress) {
    const size = file.size;
    if (size <= LARGE_FILE_PROGRESS_THRESHOLD) {
      onProgress(0.2);
      const buf = await file.arrayBuffer();
      signal.throwIfAborted();
      onProgress(1);
      return buf;
    }
    const chunkSize = 4 * 1024 * 1024;
    const merged = new Uint8Array(size);
    let offset = 0;
    while (offset < size) {
      signal.throwIfAborted();
      const slice = file.slice(offset, Math.min(offset + chunkSize, size));
      const part = await slice.arrayBuffer();
      signal.throwIfAborted();
      merged.set(new Uint8Array(part), offset);
      offset += part.byteLength;
      onProgress(offset / size);
      await yieldToMain();
    }
    return merged.buffer;
  }

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
    "Passerelle IP par défaut",
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
    /** Turkish MSInfo (Components → Ağ) uses “IP” in the gateway row title. */
    "Varsayılan IP Ağ Geçidi",
    "Varsayılan ip ağ geçidi",
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
    /** Portuguese (pt-BR) MSInfo — “Default Gateway”. */
    "Gateway padrão",
    "Gateway Padrão",
    /** pt-BR often labels default gateway as “Gateway IP padrão” (seen in network adapter exports). */
    "Gateway IP padrão",
    "Gateway IP Padrão",
    "Roteador padrão",
    "Roteador Padrão",
    /** Swedish MSInfo — “Standard-gateway för IP”. */
    "Standard-gateway för IP",
    "Standardgateway för IP",
    "Standard-gateway",
    /** Ukrainian (uk-UA) MSInfo — “Шлюз IP за замовчуванням”. */
    "Шлюз IP за замовчуванням",
    "Шлюз_IP_за_замовчуванням",
    "Стандартний шлюз",
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
    /** Portuguese (pt-BR). */
    "Servidor DHCP",
    "Servidor de DHCP",
    /** Ukrainian (uk-UA). */
    "DHCP-сервер",
    "DHCP_сервер",
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
    /** Turkish MSInfo uses {@code Öğe} / {@code Değer}; NFKC+ASCII toLowerCase may not match {@code öğe}. */
    const msinfoTagLowerTr = (/** @type {string} */ localName) => {
      try {
        return String(localName || "").normalize("NFC").toLocaleLowerCase("tr-TR");
      } catch {
        return String(localName || "").normalize("NFC").toLowerCase();
      }
    };
    const msinfoDataChildIsItemLike = (/** @type {string} */ localName) => {
      const n = normXmlTag(localName);
      if (
        /^(item|name|key|eintrag|property|objekt|элемент|елемент|elemento|élément|položka|pozycja|öğe|عنصر|στοιχείο|elementti|項目|名称|항목)$/u.test(
          n
        )
      )
        return true;
      return msinfoTagLowerTr(localName) === "öğe";
    };
    const msinfoDataChildIsValueLike = (/** @type {string} */ localName) => {
      const n = normXmlTag(localName);
      if (
        /^(value|val|wert|data|inhalt|värde|значение|значення|valor|valeur|waarde|hodnota|wartość|arvo|érték|valoare|değer|قيمة|τιμή|值|数值|値|값|väärtus)$/u.test(
          n
        )
      )
        return true;
      return msinfoTagLowerTr(localName) === "değer";
    };

    /** @param {Element} catEl @param {string[]} pathParts */
    function visitCategory(catEl, pathParts) {
      const nm =
        catEl.getAttribute("name") ||
        catEl.getAttribute("Name") ||
        catEl.getAttribute("名前") ||
        catEl.getAttribute("Ad") ||
        catEl.getAttribute("İsim") ||
        catEl.getAttribute("Имя") ||
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
            child.getAttribute("Objekt") ||
            child.getAttribute("objekt") ||
            child.getAttribute("項目") ||
            child.getAttribute("名称") ||
            child.getAttribute("항목") ||
            child.getAttribute("Элемент") ||
            child.getAttribute("Елемент") ||
            child.getAttribute("елемент") ||
            /** Turkish MSInfo saves {@code Öğe} / {@code öğe} on {@code <Data>} when the UI is Turkish. */
            child.getAttribute("Öğe") ||
            child.getAttribute("öğe");
          const attrVal =
            child.getAttribute("Value") ||
            child.getAttribute("value") ||
            child.getAttribute("Val") ||
            child.getAttribute("val") ||
            child.getAttribute("Värde") ||
            child.getAttribute("värde") ||
            child.getAttribute("値") ||
            child.getAttribute("值") ||
            child.getAttribute("数值") ||
            child.getAttribute("값") ||
            child.getAttribute("Значение") ||
            child.getAttribute("Значення") ||
            child.getAttribute("значення") ||
            child.getAttribute("Değer") ||
            child.getAttribute("değer");
          /** Some Turkish builds use NFC variants or other spellings not matched by {@code getAttribute} literals. */
          let attrItemLoose = attrItem;
          let attrValLoose = attrVal;
          for (const a of child.attributes) {
            const key = String(a.localName || a.name || "").normalize("NFC");
            let lk = "";
            try {
              lk = key.toLocaleLowerCase("tr-TR");
            } catch {
              lk = key.toLowerCase();
            }
            if (
              !String(attrItemLoose || "").trim() &&
              (/^(item|key|objekt)$/i.test(key) ||
                lk === "öğe" ||
                lk === "objekt" ||
                /^элемент$/i.test(key) ||
                normXmlTag(key) === "елемент" ||
                key === "Елемент" ||
                key === "項目" ||
                key === "名称")
            )
              attrItemLoose = a.value;
            if (
              !String(attrValLoose || "").trim() &&
              (/^(value|val|värde)$/i.test(key) ||
                lk === "değer" ||
                lk === "värde" ||
                /^значение$/i.test(key) ||
                normXmlTag(key) === "значення" ||
                key === "Значення" ||
                key === "値" ||
                key === "值")
            )
              attrValLoose = a.value;
          }
          if (attrItemLoose != null && attrValLoose != null && (String(attrItemLoose).trim() || String(attrValLoose).trim())) {
            const norm = (/** @type {string} */ s) => String(s || "").replace(/\s+/g, " ").trim();
            kvs.push({ path: pathStr, item: norm(attrItemLoose), value: norm(attrValLoose) });
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
          const fk = Object.keys(fields);
          if (fk.length >= 2 && fk.length <= 8) {
            const itemKey = fk.find((key) => msinfoDataChildIsItemLike(key));
            const valKey = fk.find((key) => msinfoDataChildIsValueLike(key));
            if (itemKey && valKey) {
              const itemText = String(fields[itemKey] || "").replace(/\s+/g, " ").trim();
              const valText = String(fields[valKey] || "").replace(/\s+/g, " ").trim();
              if (itemText || valText) {
                kvs.push({ path: pathStr, item: itemText, value: valText });
                continue;
              }
            }
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
   * @param {any} recovery result of parseMsInfoDocumentWithRecovery
   * @returns {{ kvs: { path: string, item: string, value: string }[], rows: { path: string, fields: Record<string, string> }[] } | null}
   */
  function getMsInfoStructuredDataFromRecovery(recovery) {
    if (!recovery) return null;
    if (recovery.doc) {
      try {
        return walkMsInfo(recovery.doc);
      } catch {
        /* fall through to loose/plain rows */
      }
    }
    if (recovery.data) {
      const k = recovery.data.kvs;
      const r = recovery.data.rows;
      if ((Array.isArray(k) && k.length > 0) || (Array.isArray(r) && r.length > 0)) {
        return recovery.data;
      }
    }
    return null;
  }

  /**
   * @param {{ kvs: { path: string, item: string, value: string }[] } | null} dataA
   * @param {{ kvs: { path: string, item: string, value: string }[] } | null} dataB
   */
  function diffMsInfoKvsData(dataA, dataB) {
    const kvsA = dataA && dataA.kvs ? dataA.kvs : [];
    const kvsB = dataB && dataB.kvs ? dataB.kvs : [];
    const keyOf = (/** @type {{ path: string, item: string }} */ r) => `${r.path}\u0001${r.item}`;
    const ma = new Map();
    for (const r of kvsA) {
      ma.set(keyOf(r), { path: r.path, item: r.item, value: r.value });
    }
    const mb = new Map();
    for (const r of kvsB) {
      mb.set(keyOf(r), { path: r.path, item: r.item, value: r.value });
    }
    /** @type {{ path: string, item: string, value: string }[]} */
    const onlyA = [];
    /** @type {{ path: string, item: string, value: string }[]} */
    const onlyB = [];
    /** @type {{ path: string, item: string, valueA: string, valueB: string }[]} */
    const changed = [];
    for (const [k, a] of ma) {
      if (!mb.has(k)) onlyA.push(a);
      else {
        const b = /** @type {{ path: string, item: string, value: string }} */ (mb.get(k));
        if (a.value !== b.value) {
          changed.push({ path: a.path, item: a.item, valueA: a.value, valueB: b.value });
        }
      }
    }
    for (const [k, b] of mb) {
      if (!ma.has(k)) onlyB.push(b);
    }
    return { onlyA, onlyB, changed, nA: kvsA.length, nB: kvsB.length };
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
    const it = normalizeMsinfoItemLabel(item);
    if (!it) return false;
    return (
      /^driver\s*version$/i.test(it) ||
      /^drivrutinsversion$/iu.test(it) ||
      /^drivrutin\s+version$/iu.test(it) ||
      /^versi[oó]n\s+del\s+controlador$/i.test(it) ||
      /^versi[oó]n\s+del\s+software\s+del\s+controlador$/i.test(it) ||
      /^versi[oó]n\s+del\s+driver$/i.test(it) ||
      /^версия\s*драйвера$/i.test(it) ||
      /** Ukrainian (uk-UA) — {@code Версія драйвера}. */
      /^версія\s*драйвера$/iu.test(it) ||
      /^sürücü\s+sürümü$/iu.test(it) ||
      /^sürücü\s+versiyonu$/iu.test(it) ||
      /^vers[aã]o\s+do\s+driver$/iu.test(it) ||
      /^vers[aã]o\s+do\s+controlador$/iu.test(it) ||
      /^ドライバー\s*の\s*バージョン$/i.test(it) ||
      /^ドライバーのバージョン$/i.test(it) ||
      /^ドライバのバージョン$/i.test(it) ||
      /^ドライバー\s*バージョン$/i.test(it) ||
      /^ドライバ\s*バージョン$/i.test(it)
    );
  }

  /** MSInfo localized “adapter name” row label (Item column). */
  function isDisplayNameItem(item) {
    const it = normalizeMsinfoItemLabel(item);
    if (!it) return false;
    return (
      /^name$/i.test(it) ||
      /^namn$/iu.test(it) ||
      /^nombre$/i.test(it) ||
      /^nome$/iu.test(it) ||
      /^nom$/iu.test(it) ||
      /^nome\s+do\s+adaptador$/iu.test(it) ||
      /^nome\s+do\s+dispositivo$/iu.test(it) ||
      /^имя$/i.test(it) ||
      /** Ukrainian (uk-UA) — {@code Ім'я}. */
      /^ім'я$/iu.test(it) ||
      /^імʼя$/iu.test(it) ||
      /^назва$/iu.test(it) ||
      /^наименование$/i.test(it) ||
      /^ad$/iu.test(it) ||
      /^adı$/iu.test(it) ||
      /^isim$/iu.test(it) ||
      /^名前$/i.test(it) ||
      /^名称$/i.test(it)
    );
  }

  /** @param {Record<string, string>} fields */
  function displayAdapterDisplayName(fields) {
    return (
      displayFieldByLabels(fields, [
        "Name",
        "Namn",
        "Nombre",
        "Nome",
        "Nom",
        "Имя",
        "Наименование",
        /** Ukrainian (uk-UA) — {@code Ім'я} (XML serializes as raw text in Cyrillic apostrophe). */
        "Ім'я",
        "Імʼя",
        "Назва",
        "Ad",
        "Adı",
        "İsim",
        "名前",
        "名称",
      ]) ||
      String(
        fields.Name ||
          fields.Namn ||
          fields.Nombre ||
          fields.Nome ||
          fields.Nom ||
          fields.Имя ||
          fields["Наименование"] ||
          fields["Ім'я"] ||
          fields["Імʼя"] ||
          fields["Назва"] ||
          fields.Ad ||
          fields["Adı"] ||
          fields["İsim"] ||
          fields["名前"] ||
          fields["名称"] ||
          ""
      ).trim()
    );
  }

  /** MSInfo localized “resolution” row label. */
  function isResolutionItemLabel(item) {
    const it = normalizeMsinfoItemLabel(item);
    if (!it) return false;
    return (
      /^resolution$/i.test(it) ||
      /^current resolution$/i.test(it) ||
      /^uppl[öo]sning$/iu.test(it) ||
      /^nuvarande\s+uppl[öo]sning$/iu.test(it) ||
      /^resoluci[oó]n(\s+actual)?$/i.test(it) ||
      /^разрешение$/i.test(it) ||
      /** Ukrainian (uk-UA) — {@code Роздільна здатність}. */
      /^роздільна\s+здатність$/iu.test(it) ||
      /^çözünürlük$/iu.test(it) ||
      /^geçerli\s+çözünürlük$/iu.test(it) ||
      /^resolu(ção|cao)$/iu.test(it) ||
      /^resolu(ção|cao)\s+atual$/iu.test(it) ||
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
        f["Drivrutinsversion"] ||
        f["drivrutinsversion"] ||
        f["Версия драйвера"] ||
        f["версия драйвера"] ||
        f["ドライバーのバージョン"] ||
        f["ドライバのバージョン"] ||
        f["ドライバー バージョン"] ||
        f["ドライバ バージョン"] ||
        f["Sürücü Sürümü"] ||
        f["Sürücü Versiyonu"];
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
        f["Upplösning"] ||
        f["Nuvarande upplösning"] ||
        f["Resolución"] ||
        f["Resolución actual"] ||
        f["Разрешение"] ||
        f["Текущее разрешение"] ||
        f["解像度"] ||
        f["現在の解像度"] ||
        f["画面の解像度"] ||
        f["Çözünürlük"] ||
        f["Geçerli Çözünürlük"] ||
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
      const re = new RegExp(`^${escLab}$`, "iu");
      const labNorm = msinfoFieldKeyNormLower(lab);
      for (const [k, v] of Object.entries(fields)) {
        if (v == null || !String(v).trim()) continue;
        const kt = k.trim();
        const ktNorm = normalizeMsinfoItemLabel(kt);
        if (re.test(kt) || re.test(ktNorm)) return String(v).trim();
        if (labNorm && msinfoFieldKeyNormLower(kt) === labNorm) return String(v).trim();
        if (labNorm && msinfoFieldKeyNormLower(ktNorm) === labNorm) return String(v).trim();
      }
    }
    const ov = rowLabelValueFromMsInfoFields(fields);
    if (ov.lab && ov.val != null && String(ov.val).trim()) {
      const pairLab = normalizeMsinfoItemLabel(ov.lab);
      for (const lab of labels) {
        const escLab = lab.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp(`^${escLab}$`, "iu");
        if (re.test(pairLab)) return String(ov.val).trim();
        const labNorm2 = msinfoFieldKeyNormLower(lab);
        if (labNorm2 && msinfoFieldKeyNormLower(pairLab) === labNorm2) return String(ov.val).trim();
      }
    }
    return "";
  }

  /** MSInfo Components → Display — “Driver date” row (Item column) across locales. */
  function displayDriverDateMs(fields) {
    return (
      displayFieldByLabels(fields, [
        "Driver Date",
        "Drivrutinsdatum",
        "Fecha del controlador",
        "Fecha de controlador",
        "Fecha del driver",
        "Data del controlador",
        "Дата драйвера",
        "Sürücü Tarihi",
        "Sürücü tarihi",
        "Sürücünün tarihi",
        "Sürüm Tarihi",
        "Sürüm tarihi",
        "Sürücü sürüm tarihi",
        "Sürücü Sürüm Tarihi",
        "ドライバーの日付",
        "ドライバの日付",
        "ドライバー 日付",
        "バージョンの日付",
        "ドライバー バージョンの日付",
        "ドライバのバージョンの日付",
        "Data do driver",
        "Data do Driver",
      ]) || ""
    );
  }

  /**
   * Some locales only list driver version + date inside the long {@code Controlador} / driver path row.
   * @param {Record<string, string>} fields
   * @param {string} vendorLabel
   */
  function scrapeGpuDriverVersionAndDateFromFields(fields, vendorLabel) {
    const vals = [];
    for (const [k, v] of Object.entries(fields)) {
      if (v == null || !String(v).trim()) continue;
      const kl = msinfoFieldKeyNormLower(k);
      if (/controlador|driver|treiber|drivrutin/i.test(kl)) vals.push(String(v));
    }
    const blob = vals.join(" ");
    let ver = "";
    if (vendorLabel === "NVIDIA") {
      const m = blob.match(/\b(3[12]\.0\.15\.\d{4,8})\b/);
      if (m) ver = m[1];
    }
    if (!ver) {
      const quads = blob.match(/\b\d+\.\d+\.\d+\.\d+\b/g) || [];
      for (const q of quads) {
        if (vendorLabel === "NVIDIA" && isNvidiaDriverVersionString(q)) {
          ver = q;
          break;
        }
        if (
          vendorLabel === "AMD" &&
          !isIntelDriverVersionString(q) &&
          !isNvidiaDriverVersionString(q) &&
          /\d+\.\d+\.\d+\.\d+/.test(q)
        ) {
          ver = q;
          break;
        }
      }
    }
    let dateStr = "";
    const dm = blob.match(/\b(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})(?:\s+\d{1,2}:\d{2})?\b/);
    if (dm) dateStr = dm[1].trim();
    return { driverFull: ver, driverDate: dateStr };
  }

  /** MSInfo Components → Display — dedicated / adapter video memory row labels. */
  function displayAdapterRamMs(fields) {
    return (
      displayFieldByLabels(fields, [
        "Adapter RAM",
        "Adapter-RAM",
        "Adaptörens RAM",
        "Adaptorns RAM",
        "Dedikerat videominne",
        "Dedikerat minne",
        "Konfigurerat videominne",
        "Mémoire vive sur la carte",
        "ОЗУ адаптера",
        "Память адаптера",
        /** Ukrainian (uk-UA) — {@code ОЗП адаптера}. */
        "ОЗП адаптера",
        "Bağdaştırıcı RAM",
        "Bağdaştırıcı RAM'i",
        "Bağdaştırıcı RAMi",
        "Bağdaştırıcı Belleği",
        "Bağdaştırıcı bellek",
        "Ayrılmış Video Belleği",
        "Ayrılmış video belleği",
        "Özel Video Belleği",
        "Özel video belleği",
        "Özel Grafik Belleği",
        "Özel grafik belleği",
        "アダプター RAM",
        "アダプタ RAM",
        "アダプターの RAM",
        "RAM do adaptador",
        "Memória do adaptador",
        "Memória RAM do adaptador",
        "Memória de vídeo dedicada",
        "Memória de video dedicada",
        "Memoria dedicada",
        "Memoria de adaptador dedicada",
        "Memoria de vídeo dedicada",
        "Memoria de video dedicada",
      ]) || ""
    );
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

  /**
   * PNP / instance ID string for a display adapter block (localized Item keys + fallback: any field value containing VEN_/DEV_).
   * @param {Record<string, string>} fields
   */
  function pickPnpStringFromAdapterFields(fields) {
    const fromLabels = displayFieldByLabels(fields, [
      "PNP Device ID",
      "PNP_Device_ID",
      /** Ukrainian (uk-UA) — {@code Код PNP-пристрою}. */
      "Код PNP-пристрою",
      "Код_пристрою_PNP",
      "Код пристрою PNP",
      "ID de périphérique Plug-and-Play",
      "ID du périphérique Plug-and-Play",
      "ID de périphérique Plug and Play",
      "ID du périphérique Plug and Play",
      "ID PNP-устройства",
      "ИД PNP-устройства",
      "PNP デバイス ID",
      "PNPデバイス ID",
      "Plug and Play デバイス ID",
      "Tak ve Çalıştır Aygıt Kimliği",
      "Tak ve Çalıştır aygıt kimliği",
      "Tak ve Çalıştır Aygıtı Kimliği",
      "Tak ve Çalıştır aygıtı kimliği",
      "PnP Aygıt Kimliği",
      "PnP aygıt kimliği",
      "ID do dispositivo PnP",
      "ID PnP do dispositivo",
      "Identificação do dispositivo Plug and Play",
      "Identificação Plug and Play do dispositivo",
      "Plug and Play-enhets-ID",
      "Plug and Play enhets-ID",
      "PnP-enhetsidentifierare",
    ]);
    if (fromLabels) return String(fromLabels).trim();
    if (!fields || typeof fields !== "object") return "";
    for (const v of Object.values(fields)) {
      const s = String(v ?? "").trim();
      if (!s) continue;
      const m = s.match(/\bVEN_[0-9A-F]{4}&DEV_[0-9A-F]{4}/i);
      if (m) return m[0];
    }
    return "";
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
      /Display|Monitor|Graphics|Video|VideoController|Videocontroller|Affichage|Carte\s+graphique|Cartes\s+graphiques|Contr[oô]leur\s+vid[eé]o|Contr[oô]leurs\s+vid[eé]o|Écran|Ecran|Дисплей|Экран|Видео|Монитор|Видеоконтроллер|Видеоадапт|Екран|Дисплей|Відеоадаптер|Відеоконтролер|Відеокарта|Görüntü|Ekran|Grafik|Grafikler|Bileşenler.*Görüntü|Bildskärm|Grafikkort|Skärm|Komponenter.*(?:Bildskärm|Grafik|Grafikkort)|Exibi[cç][aã]o|Exibicao|V[ií]deo|Pantalla|Tarjeta\s+gr[aá]fica|Placa\s+de\s+v[ií]deo|Componentes.*(?:Exibi|V[ií]deo|Monitor|Pantalla)|表示|ディスプレイ|グラフィック|グラフィックス|ビデオ|モニター|モニタ|ビデオアダプタ|ビデオ\s*コントローラ/i.test(
        path
      ) &&
      !/USB.*Audio|Sound Driver|Audio Device|Périphérique\s+audio|Périphériques\s+audio|P[ée]riph[ée]rique\s+audio|P[ée]riph[ée]riques\s+audio|Звук|аудио|Звуковий\s+пристрій|オーディオ|サウンド/i.test(
        path
      )
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
      const itemKey = normalizeMsinfoItemLabel(itemTrim) || itemTrim || k.item;
      if (isDisplayNameItem(itemTrim) || isDisplayNameItem(itemKey)) {
        if (cur && Object.keys(cur.fields).length > 0) segments.push(cur);
        cur = { path: k.path, fields: {} };
      } else if (!cur) {
        cur = { path: k.path, fields: {} };
      }
      cur.fields[itemKey] = k.value;
      cur.path = k.path;
    }
    if (cur && Object.keys(cur.fields).length > 0) segments.push(cur);

    return segments.filter((s) => {
      const name = displayAdapterDisplayName(s.fields);
      const pnp = pickPnpStringFromAdapterFields(s.fields);
      const vals = Object.values(s.fields).join(" ");
      // Exclude audio endpoints (e.g. "NVIDIA High Definition Audio") which are not display adapters.
      if (
        (/HDAUDIO/i.test(vals) || /high definition audio|audio/i.test(String(name || ""))) &&
        !/VEN_[0-9A-F]{4}&DEV_[0-9A-F]{4}/i.test(vals)
      )
        return false;
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
      const vals = `${name} ${Object.values(f || {}).join(" ")}`;
      if (/HDAUDIO/i.test(vals) && !/VEN_[0-9A-F]{4}&DEV_[0-9A-F]{4}/i.test(vals)) continue;
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
      const pnp = pickPnpStringFromAdapterFields(s.fields).replace(/\s+/g, "").toUpperCase();
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
    const pnp = pickPnpStringFromAdapterFields(fields).replace(/\s+/g, "").toUpperCase();
    const n = name.toLowerCase();
    // Some exports include HDMI/HD-audio endpoints near Display; never classify as a GPU adapter.
    if (/audio|high definition audio/.test(n) || /^hdaudio\\/.test(pnp)) return "AUDIO";
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
        "Drivrutinsversion",
        "Versión del controlador",
        "Versión del software del controlador",
        "Versión del driver",
        "Versão do driver",
        "Versão do Driver",
        "Version du pilote",
        "Версия драйвера",
        "Sürücü Sürümü",
        "Sürücü Versiyonu",
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
      let d =
        displayFieldByLabels(fields, ["Driver Version", "Drivrutinsversion"]) || "";
      if (d && isNvidiaDriverVersionString(d) && !isIntelDriverVersionString(d)) d = "";
      driverFull = d;
    }

    let nvidiaDriverFormatted = "";
    if (vendorLabel === "NVIDIA" && driverFull && isNvidiaDriverVersionString(driverFull)) {
      nvidiaDriverFormatted = nvidiaInternalToDisplayVersion(driverFull);
    }

    const nmDriverVer = displayFieldByLabels(fields, [
      "Driver Version",
      "Drivrutinsversion",
      "Versión del controlador",
      "Versión del software del controlador",
      "Versión del driver",
      "Versão do driver",
      "Versão do Driver",
      "Version du pilote",
      "Версия драйвера",
      "Sürücü Sürümü",
      "Sürücü Versiyonu",
      "ドライバーのバージョン",
      "ドライバのバージョン",
      "ドライバー バージョン",
      "ドライバ バージョン",
    ]);
    let driverDateStr = displayDriverDateMs(fields);
    {
      const mined = scrapeGpuDriverVersionAndDateFromFields(fields, vendorLabel);
      if (!driverFull && mined.driverFull) {
        driverFull = mined.driverFull;
        if (vendorLabel === "NVIDIA" && driverFull && isNvidiaDriverVersionString(driverFull)) {
          nvidiaDriverFormatted = nvidiaInternalToDisplayVersion(driverFull);
        }
      }
      if (!driverDateStr && mined.driverDate) driverDateStr = mined.driverDate;
    }
    let driverVersionDisplay = "";
    if (vendorLabel === "NVIDIA") {
      driverVersionDisplay = nvidiaDriverFormatted || nmDriverVer || driverFull || "";
    } else {
      driverVersionDisplay = nmDriverVer || driverFull || "";
    }

    const resRaw = displayFieldByLabels(fields, [
      "Resolution",
      "Current Resolution",
      "Upplösning",
      "Nuvarande upplösning",
      "Aktuell upplösning",
      "Résolution",
      "Resolución",
      "Resolución actual",
      "Resolução",
      "Resolução atual",
      "Разрешение",
      "Текущее разрешение",
      "Çözünürlük",
      "Geçerli Çözünürlük",
      "解像度",
      "現在の解像度",
      "画面の解像度",
    ]);
    let resolution = "";
    const resTrim = resRaw ? String(resRaw).trim() : "";
    if (
      resTrim &&
      !/^not available|^n\/a$/i.test(resTrim) &&
      !/^inte\s+tillgänglig$/iu.test(resTrim) &&
      !/^ej\s+tillgänglig$/iu.test(resTrim)
    ) {
      resolution = resTrim;
    }

    const nvidiaDrivesDisplay = vendorLabel === "NVIDIA" && !!resolution;
    const pnp = pickPnpStringFromAdapterFields(fields);
    const devId = pnpToDeviceId(pnp);

    return {
      name,
      resolution,
      driverFull,
      driverFormatted: nvidiaDriverFormatted,
      drivesDisplay: vendorLabel !== "NVIDIA" || nvidiaDrivesDisplay,
      vendorLabel,
      driverVersionDisplay,
      driverDate: driverDateStr,
      deviceId: devId,
      pciLookupUrl: pciLookupUrlFromDeviceId(devId),
      adapterType:
        displayFieldByLabels(fields, [
          "Adapter Type",
          "Adaptortyp",
          "Typ av adapter",
          "Adaptertyp",
          "Type de carte",
          "Tipo de adaptador",
          "Tipo de Adaptador",
          "Тип адаптера",
          "Описание адаптера",
          "Bağdaştırıcı Türü",
          "アダプターの種類",
          "アダプター種類",
          "アダプタの種類",
          "アダプター タイプ",
          "製品の種類",
          "チップの種類",
          "チップ タイプ",
        ]) || "",
      adapterRam: displayAdapterRamMs(fields),
    };
  }

  /** @param {Record<string, unknown> | null | undefined} g */
  function hasGpuCardContent(g) {
    return !!(g && (g.name || g.driverFull || g.driverVersionDisplay || g.adapterType || g.deviceId));
  }

  /** @param {string} name */
  function gpuVendorLabelFromName(name) {
    const n = String(name || "").toLowerCase();
    // Filter out HDMI/HD-audio endpoints that sometimes show up near Display sections.
    if (/audio/.test(n) && /nvidia/.test(n)) return "AUDIO";
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
      const isAudioLike = (/** @type {any} */ a) => /audio|high definition audio/i.test(String(a?.name || ""));
      const isGpuLike = (/** @type {any} */ a) =>
        /geforce|rtx|quadro|tesla|ven_10de/i.test(
          `${String(a?.name || "")} ${String(a?.deviceId || "")} ${String(a?.driverVersionDisplay || "")}`.toLowerCase()
        );
      const nvidia =
        adaptersFromSegments.find((a) => a.vendorLabel === "NVIDIA" && isGpuLike(a) && !isAudioLike(a)) ||
        adaptersFromSegments.find((a) => a.vendorLabel === "NVIDIA" && !isAudioLike(a)) ||
        adaptersFromSegments.find((a) => a.vendorLabel === "NVIDIA") ||
        null;
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
          "Drivrutinsversion",
          "Versão do driver",
          "Versão do Driver",
          "Версия драйвера",
          /** Ukrainian (uk-UA) — {@code Версія драйвера}. */
          "Версія драйвера",
          "Sürücü Sürümü",
          "Sürücü Versiyonu",
          "ドライバーのバージョン",
          "ドライバのバージョン",
          "ドライバー バージョン",
          "ドライバ バージョン",
        ]),
        driverDate: displayDriverDateMs(intelFields),
        pnp: pickPnpStringFromAdapterFields(intelFields),
        adapterType: displayFieldByLabels(intelFields, [
          "Adapter Type",
          "Adaptortyp",
          "Typ av adapter",
          "Adaptertyp",
          "Tipo de adaptador",
          "Tipo de Adaptador",
          "Тип адаптера",
          "Описание адаптера",
          /** Ukrainian (uk-UA) — {@code Тип адаптера} / {@code Опис адаптера}. */
          "Опис адаптера",
          "Bağdaştırıcı Türü",
          "アダプターの種類",
          "アダプター種類",
          "アダプタの種類",
          "アダプター タイプ",
          "製品の種類",
          "チップの種類",
          "チップ タイプ",
        ]),
        adapterRam: displayAdapterRamMs(intelFields),
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
          "Drivrutinsversion",
          "Versão do driver",
          "Versão do Driver",
          "Версия драйвера",
          /** Ukrainian (uk-UA) — {@code Версія драйвера}. */
          "Версія драйвера",
          "Sürücü Sürümü",
          "Sürücü Versiyonu",
          "ドライバーのバージョン",
          "ドライバのバージョン",
          "ドライバー バージョン",
          "ドライバ バージョン",
        ]),
        driverDate: displayDriverDateMs(nvidiaFields),
        pnp: pickPnpStringFromAdapterFields(nvidiaFields),
        adapterType: displayFieldByLabels(nvidiaFields, [
          "Adapter Type",
          "Adaptortyp",
          "Typ av adapter",
          "Adaptertyp",
          "Tipo de adaptador",
          "Tipo de Adaptador",
          "Тип адаптера",
          "Описание адаптера",
          /** Ukrainian (uk-UA) — {@code Тип адаптера} / {@code Опис адаптера}. */
          "Опис адаптера",
          "Bağdaştırıcı Türü",
          "アダプターの種類",
          "アダプター種類",
          "アダプタの種類",
          "アダプター タイプ",
          "製品の種類",
          "チップの種類",
          "チップ タイプ",
        ]),
        adapterRam: displayAdapterRamMs(nvidiaFields),
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
      fields.Nombre ||
      fields.Nome ||
      fields.Nom ||
      fields["Adı"] ||
      fields.Имя ||
      fields["名前"] ||
      fields["デバイス名"] ||
      fields.Device ||
      fields.Item ||
      fields.Description ||
      "";
    const desc =
      fields.Description ||
      fields["Product Name"] ||
      fields["Ürün Türü"] ||
      fields["Тип продукта"] ||
      fields["製品名"] ||
      "";
    const aType =
      fields["Adapter Type"] ||
      fields["Type de carte"] ||
      fields["Tipo de adaptador"] ||
      fields["Tipo de Adaptador"] ||
      fields["Bağdaştırıcı Türü"] ||
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
    if (
      /802\.3|ieee\s*802\.3/i.test(aType.toLowerCase()) &&
      !/wi-?fi|802\.11|wlan|wireless|rz616|mt792|mediatek|ax\d{3}|killer/i.test(hayName) &&
      !/wi-?fi|802\.11|wlan|wireless|rz616|mt792|mediatek/i.test(hayAll)
    ) {
      return "Ethernet (reported as 802.3)";
    }
    if (
      /802\.3|ieee\s*802\.3/i.test(hayAll) &&
      !/wi-?fi|802\.11|wlan|wireless|rz616|mt792|mediatek/i.test(hayAll)
    ) {
      return "Unknown (802.3 in export — if you use Wi‑Fi, trust the adapter name)";
    }
    return "Other / unknown";
  }

  /** @param {Record<string, string>} fields */
  function networkAdapterIdentityKey(fields) {
    const raw =
      fields.Name ||
      fields.Namn ||
      fields.Nombre ||
      fields.Nome ||
      fields.Nom ||
      fields["Adı"] ||
      fields.Имя ||
      /** Ukrainian (uk-UA) — XML tag {@code <Ім_я>} or text {@code Ім'я}. */
      fields["Ім_я"] ||
      fields["Ім'я"] ||
      fields["Імʼя"] ||
      fields["Назва"] ||
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
  /** MSInfo field keys vary by UI language; Turkish dotted/caseless I needs {@code tr-TR} folding. */
  function msinfoFieldKeyNormLower(/** @type {string} */ k) {
    const t = String(k || "")
      .replace(/^\ufeff/, "")
      .replace(/\u00a0/g, " ")
      .trim()
      .replace(/\s+/g, " ");
    try {
      return t.toLocaleLowerCase("tr-TR");
    } catch {
      return t.toLowerCase();
    }
  }

  /**
   * Turkish “IP …” keys lower to “ıp…” under tr-TR; fold dotless ı → ASCII i so `includes("ip")` / {@code /ip/i} checks match MSInfo.
   * @param {string} k
   */
  function networkFieldKeyAsciiFold(k) {
    return msinfoFieldKeyNormLower(k).replace(/\u0131/g, "i");
  }

  function getNetworkField(fields, ...exactNames) {
    for (const n of exactNames) {
      const v = fields[n];
      if (v != null && String(v).trim()) return String(v);
    }
    const lowerMap = new Map();
    for (const [k, v] of Object.entries(fields)) {
      if (v == null || !String(v).trim()) continue;
      lowerMap.set(msinfoFieldKeyNormLower(k), v);
    }
    for (const n of exactNames) {
      const hit = lowerMap.get(msinfoFieldKeyNormLower(n));
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
      /** Turkish MSInfo — tr-TR lowercases “IP” to “ıp…”, so explicit + ascii-fold fallback below. */
      "IP Adresi",
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
      "عنوان IPv4",
      /** Portuguese (pt-BR) — “IP Address(es)”. */
      "Endereço IP",
      "Endereços IP",
      "Endereco IP",
      "Enderecos IP",
      /** Ukrainian (uk-UA) — XML element {@code <IP_адреса>} (decoded as space-separated key) and label {@code IP-адреса}. */
      "IP-адреса",
      "IP_адреса",
      "IPv4-адреса"
    );
    let hit = tryVal(direct);
    if (hit) return hit;
    for (const [k, v] of Object.entries(fields)) {
      if (!v || !String(v).trim()) continue;
      const kl = msinfoFieldKeyNormLower(k);
      const klA = networkFieldKeyAsciiFold(k);
      const addrHint =
        /address|адрес|адреса|adres|addr|osoite|direcci|indirizzo|endereço|endereco|διεύθυνση|주소|地址|aadress|adresă|adresse|c[iíì]m|عنوان/i.test(
          kl
        );
      /** pt-BR / truncated MSInfo: “Endereço(s) IP…”, “Endereço …” */
      if (
        /^endere[çc]o/i.test(kl) &&
        /ip|адрес|addr|address/i.test(kl) &&
        !kl.includes("ipv6") &&
        !/dns|gateway|multicast|wins/i.test(kl)
      ) {
        hit = tryVal(v);
        if (hit) return hit;
      }
      if (
        (klA.includes("ipv4") && addrHint) ||
        (klA.includes("ip") && addrHint && !klA.includes("ipv6")) ||
        (/ipv4/i.test(klA) && addrHint && !klA.includes("ipv6"))
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
        "IPv4 地址",
        "IP Adresi",
        "IP adresi",
        /** Ukrainian (uk-UA). */
        "IP-адреса",
        "IP_адреса",
        "IPv4-адреса"
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
      const kl = msinfoFieldKeyNormLower(k);
      const klA = networkFieldKeyAsciiFold(k);
      if (/dns|multicast|gateway/i.test(klA)) continue;
      if (
        /^ip\s*address$/i.test(klA) ||
        (/ipv6/i.test(klA) && /address|addr|адрес|adres|osoite|direcci|indirizzo|endereço|διεύθυνση|주소|地址|aadress|adresă|adresse|c[iíì]m|عنوان/i.test(kl))
      )
        scan(v);
      if (
        /ip/i.test(klA) &&
        /адрес|adres|osoite|direcci|indirizzo|endereço|διεύθυνση|주소|地址|aadress|adresă|adresse|c[iíì]m|عنوان/i.test(kl) &&
        !/ipv6|dns|шлюз|gateway/i.test(klA)
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
    for (const n of ["IP Address", "IP address", "IP-адрес", "IP-адреса", "IP_адреса", "IP Adresi", "IP adresi", "Addresses"]) {
      const v = getNetworkField(fields, n) || fields[n];
      if (v) {
        const hit = tryValue(v);
        if (hit) return hit;
      }
    }
    for (const [k, v] of Object.entries(fields)) {
      if (!v || !String(v).trim()) continue;
      const kl = msinfoFieldKeyNormLower(k);
      const klA = networkFieldKeyAsciiFold(k);
      if (
        /ip/i.test(klA) &&
        /адрес|adres|addr|address|osoite|direcci|indirizzo|endereço|διεύθυνση|주소|地址|aadress|adresă|adresse|c[iíì]m|عنوان/i.test(kl) &&
        !/ipv6|dns|шлюз|gateway/i.test(klA)
      ) {
        const hit = tryValue(v);
        if (hit) return hit;
      }
      if (!klA.includes("ipv6")) continue;
      if (/(dns|gateway|multicast)/i.test(klA)) continue;
      if (!/(address|addr\.?|адрес|adres)/i.test(kl) && !/^ipv6 address$/i.test(klA)) continue;
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
      "DNS Sunucuları",
      "DNS Sunucusu",
      "Tercih Edilen DNS Sunucusu",
      "Alternatif DNS Sunucusu",
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
      const kl = msinfoFieldKeyNormLower(k);
      /** “Sunucu” matches DHCP server rows — not DNS (avoids duplicate next to “DHCP Server”). */
      if (/dhcp/i.test(kl)) continue;
      if (!/dns|suffix|sunucu/.test(kl)) continue;
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
      /\bnetwork|\bnetzwerk|\bréseau|\bnätverk|\bnätverksadapter|\bnätverkskort|\bnätverksanslutning|\bkomp(?:onenter)?\/\s*nätverk/i.test(
        p
      ) ||
      /\bnetworking\b|tcp\/ip|ipconfig|wlan|wi-?fi|wifi\b|802\.11|wireless lan|ethernet connection|nic\b|network adapter|win32.*network|remote access|vpn|hyper-?v.*switch/i.test(
        p
      ) ||
      /\bRede\b|Adaptadores\s+de\s+rede|Componentes.*\bRede\b|Conex(ões|oes)\s+de\s+rede|rede\s+e\s+internet/i.test(
        p
      ) ||
      /\bAdaptadores\s+de\s+red\b|\bConexiones\s+de\s+red\b|Componentes\s*\/\s*Red(?:\s*\/|\s*$)/i.test(p) ||
      /ağ\s*bağdaştırıcıları|ağ\s*bağlantıları|bağdaştırıcı|Bileşenler.*Ağ|Bileşenler.*ağ/i.test(p) ||
      /\bсеть\b|сетев|адаптер|tcp\s*\/\s*ip|беспровод|подключен|удаленн|компоненты.*сеть|сеть.*адапт/i.test(p) ||
      /Мережа|Мережев|Бездротов|Підключенн|Адаптер|Компоненти.*Мережа|Мережев.*адаптер|Мережеві\s+підключення/iu.test(p) ||
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
        /^nom$/iu.test(it) ||
        /^naam$/i.test(it) ||
        /^navn$/i.test(it) ||
        /^název$/i.test(it) ||
        /^nazwa$/i.test(it) ||
        /^nombre$/i.test(it) ||
        /^имя$/i.test(it) ||
        /^наименование$/i.test(it) ||
        /** Ukrainian (uk-UA) — {@code Ім'я} (regular apostrophe or modifier letter), and the {@code Ім_я} XML tag form. */
        /^ім['ʼ]?я$/iu.test(it) ||
        /^ім_я$/iu.test(it) ||
        /^назва$/iu.test(it) ||
        /^名称$/i.test(it) ||
        /^名稱$/i.test(it) ||
        /^名前$/i.test(it) ||
        /^이름$/i.test(it) ||
        /^الاسم$/i.test(it) ||
        /^όνομα$/iu.test(it) ||
        /^ad$/iu.test(it) ||
        /^adı$/iu.test(it) ||
        /^isim$/iu.test(it)
      );
    };
    const recordHasAdapterNameKey = (/** @type {Record<string, string>} */ rec) => {
      for (const k of Object.keys(rec)) {
        if (!rec[k]) continue;
        if (isAdapterNameItem(k)) return true;
      }
      return (
        Object.prototype.hasOwnProperty.call(rec, "Name") ||
        Object.prototype.hasOwnProperty.call(rec, "Nombre") ||
        Object.prototype.hasOwnProperty.call(rec, "Nom") ||
        Object.prototype.hasOwnProperty.call(rec, "Имя") ||
        Object.prototype.hasOwnProperty.call(rec, "Ім'я") ||
        Object.prototype.hasOwnProperty.call(rec, "Імʼя") ||
        Object.prototype.hasOwnProperty.call(rec, "Ім_я") ||
        Object.prototype.hasOwnProperty.call(rec, "Назва") ||
        Object.prototype.hasOwnProperty.call(rec, "Ad") ||
        Object.prototype.hasOwnProperty.call(rec, "Adı")
      );
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
    const blob = `${path} ${fields.Name || ""} ${fields.Namn || ""} ${fields.Nombre || ""} ${fields.Nome || ""} ${fields.Nom || ""} ${fields["Adı"] || ""} ${fields.Имя || ""} ${fields["名前"] || ""} ${fields["デバイス名"] || ""} ${fields.Ad || ""} ${fields["İsim"] || ""} ${fields.Nimi || ""} ${fields.Naam || ""} ${fields.Nazwa || ""} ${fields.Device || ""} ${fields.Description || ""} ${fields["Adapter Type"] || ""} ${fields["Type de carte"] || ""} ${fields["Тип адаптера"] || ""} ${fields["Bağdaştırıcı Türü"] || ""} ${fields["Connection Name"] || ""}`.toLowerCase();
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
      const kl = msinfoFieldKeyNormLower(k);
      /** “Sunucu” alone would match Turkish DHCP server rows — those are handled in {@link hasDnsOrInfrastructureHint}. */
      if (!/dns|nameserver|name server|resolver|dns\s*sunucu/i.test(kl)) continue;
      if (/suffix|search list|hostname|wins|netbios|node type|vendor/i.test(kl)) continue;
      if (dnsValueListsResolver(v)) return true;
    }
    for (const { k, v } of pickDnsDetailEntries(fields)) {
      const kl = msinfoFieldKeyNormLower(k);
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
    let gw = getNetworkField(fields, ...MSINFO_IPV4_GATEWAY_LABELS) || fields["Default IP Gateway"] || "";
    let dhcpSrv = getNetworkField(fields, ...MSINFO_DHCP_SERVER_LABELS) || fields["DHCP Server"] || "";
    const collectIpv4FromValue = (/** @type {string} */ raw) => {
      const ips = String(raw || "").match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g) || [];
      return ips.filter((ip) => isUsableInternetIpv4(ip));
    };
    if (!collectIpv4FromValue(gw).length) {
      for (const [k, v] of Object.entries(fields)) {
        if (!v || !String(v).trim()) continue;
        const kl = msinfoFieldKeyNormLower(k);
        if (/dhcp|dns|suffix|wins|netbios|hostname|vendor|multicast|ipv6/i.test(kl)) continue;
        if (
          !/(gateway|gatewa|gatew|roteador|roteador padr|br[áa]na|шлюз|yhdyskäytävä|ağ geçidi|default.*gateway|puerta|passerelle|standardgateway|oletusyhdyskäytävä|porta de liga|porta de entrada|ipv4.*gateway|ip.*gateway)/i.test(
            kl
          )
        )
          continue;
        const ok = collectIpv4FromValue(String(v));
        if (ok.length) {
          gw = String(v).trim();
          break;
        }
      }
    }
    if (!collectIpv4FromValue(dhcpSrv).length) {
      for (const [k, v] of Object.entries(fields)) {
        if (!v || !String(v).trim()) continue;
        const kl = msinfoFieldKeyNormLower(k);
        if (/suffix|search|hostname|vendor|multicast/i.test(kl)) continue;
        if (
          !/(^|[^a-z])dhcp([^a-z]|$)/i.test(kl) ||
          !/(server|servidor|sunucu|serwer|сервер|palvelin|serveur|servidor)/i.test(kl)
        )
          continue;
        const ok = collectIpv4FromValue(String(v));
        if (ok.length) {
          dhcpSrv = String(v).trim();
          break;
        }
      }
    }
    const blob = `${gw} ${dhcpSrv}`;
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
      /media state[^\n]*connected|netconnectionstatus.*2|connection.*\bconnected\b|operational status[^\n]*up|подключен|включен|bağlı|bağlandı|etkin|çalışıyor|接続済み|接続されています|状態[^\n]*接続/i.test(
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
   * Stable key so Turkish + English MSInfo labels for the same fact collapse to one row
   * (first wins — usually the canonical English label from {@code detailKeyGroups}).
   * @param {string} k
   * @param {string} v
   */
  function networkDetailSemanticDedupeKey(k, v) {
    const vTrim = String(v || "").trim();
    const a = networkFieldKeyAsciiFold(k).replace(/\s+/g, " ");
    if (/^dhcp (server|sunucusu)$/.test(a)) return `dhcp_srv\t${vTrim}`;
    /** tr-TR lowers “IP …” to “ıp …” — fold already applied in {@code a}. */
    if (/^ı?p addresses?$/.test(a) || /^ı?p adresi$/.test(a)) return `ip_combo\t${vTrim.replace(/\s+/g, " ")}`;
    return `${a}\t${vTrim}`;
  }

  /** @param {{ k: string, v: string }[]} details */
  function dedupeNetworkDetailRows(details) {
    const seen = new Set();
    /** @type {{ k: string, v: string }[]} */
    const out = [];
    for (const d of details) {
      const sig = networkDetailSemanticDedupeKey(d.k, d.v);
      if (seen.has(sig)) continue;
      seen.add(sig);
      out.push(d);
    }
    return out;
  }

  /**
   * Lightweight fallback: collect every adapter row we can identify so the Network section can show
   * something even when no adapter has a usable IPv4/IPv6 in the export ({@code Не доступно} everywhere).
   * @param {{ path: string, item: string, value: string }[]} kvs
   * @param {{ path: string, fields: Record<string, string> }[]} rows
   * @returns {{ name: string, productType: string, dhcpEnabled: string, macAddress: string, serviceName: string }[]}
   */
  function extractAllNetworkAdaptersFallback(kvs, rows) {
    /** @type {{ name: string, productType: string, dhcpEnabled: string, macAddress: string, serviceName: string, ipv4: string, ipv6: string, gateway: string, dhcpServer: string, subnet: string, path: string }[]} */
    const out = [];
    const seenNames = new Set();
    /** Limit to "Adapter" sub-paths only (skip Protocol / WinSock / WAN protocols). */
    const isAdapterPath = (/** @type {string} */ p) => {
      const s = String(p || "");
      if (!pathLooksLikeNetworkSection(s)) return false;
      if (/winsock|protocol|протокол|protocole|protokoll|プロトコル|协议|wsock|wsa|winsock2/i.test(s)) return false;
      if (
        /(^|\/)\s*(Адаптер|Adapter|Adaptér|Adattatore|Adapt[ae]dor|Adaptör|Adaptér|Adapt[oa]rs?)\s*(\/|$)/iu.test(
          s
        )
      )
        return true;
      /** Some exports embed adapters directly under "Network/Components/Network". */
      if (/(^|\/)\s*(Мережа|Network|Netzwerk|Réseau|Rede|Red|Nätverk|Netværk|Verkko|Ağ)\s*$/iu.test(s)) return true;
      return false;
    };
    /** @type {Map<string, { path: string, item: string, value: string }[]>} */
    const kvsByPath = new Map();
    for (const k of kvs) {
      if (!isAdapterPath(k.path)) continue;
      if (!kvsByPath.has(k.path)) kvsByPath.set(k.path, []);
      kvsByPath.get(k.path).push(k);
    }
    /** @param {Record<string, string>} f @param {string} path */
    const pickFromFields = (f, path) => {
      if (!f) return null;
      const name = String(
        f["Ім'я"] || f["Імʼя"] || f["Ім_я"] || f.Name || f.Namn || f.Nombre || f.Nome || f["名前"] || f.Имя || ""
      ).trim();
      const productType = String(
        f["Тип продукту"] || f["Тип_продукту"] || f["Product Type"] || f["Тип продукции"] || f["Тип продукта"] || ""
      ).trim();
      const dhcpEnabled = String(
        f["DHCP увімк."] || f["DHCP_увімк_"] || f["DHCP Enabled"] || f["DHCP включен"] || ""
      ).trim();
      const macAddress = String(
        f["MAC-адреса"] || f["MAC_адреса"] || f["MAC Address"] || f["MAC-адрес"] || ""
      ).trim();
      const serviceName = String(
        f["Ім'я служби"] || f["Імʼя служби"] || f["Ім_я_служби"] || f["Service Name"] || f["Имя службы"] || ""
      ).trim();
      const ipv4 = pickIpv4FromFields(f) || "";
      const ipv6 = collectAllIpv6ForDisplay(f) || "";
      const gateway = String(
        f["Шлюз IP за замовчуванням"] || f["Шлюз_IP_за_замовчуванням"] || f["Default IP Gateway"] || f["Default Gateway"] ||
          f["Шлюз IP по умолчанию"] || ""
      ).trim();
      const dhcpServer = String(
        f["DHCP-сервер"] || f["DHCP_сервер"] || f["DHCP Server"] || ""
      ).trim();
      const subnet = String(
        f["IP-підмережа"] || f["IP_підмережа"] || f["IP Subnet"] || f["Subnet Mask"] || f["IP-подсеть"] || ""
      ).trim();
      if (!name && !productType && !macAddress && !serviceName) return null;
      return { name: name || productType, productType, dhcpEnabled, macAddress, serviceName, ipv4, ipv6, gateway, dhcpServer, subnet, path };
    };
    for (const r of rows) {
      if (!isAdapterPath(r.path)) continue;
      const e = pickFromFields(r.fields, r.path);
      if (!e) continue;
      const key = `${r.path}\u0001${e.name.toLowerCase()}`;
      if (e.name && seenNames.has(key)) continue;
      seenNames.add(key);
      out.push(e);
    }
    for (const [path, list] of kvsByPath) {
      /** Build per-adapter records by splitting on the localized "Name" item, so every {@code <Data>} row under {@code Network / Adapter} feeds exactly one adapter. */
      const records = splitNetworkKvsIntoAdapterRecords(list);
      for (const f of records) {
        const e = pickFromFields(f, path);
        if (!e) continue;
        const key = `${path}\u0001${e.name.toLowerCase()}`;
        if (e.name && seenNames.has(key)) continue;
        seenNames.add(key);
        out.push(e);
      }
    }
    /** Filter out clearly virtual / placeholder entries (Kernel Debug, WAN Miniport variants, Bluetooth PAN) when something better exists. */
    const isVirtual = (/** @type {string} */ n) =>
      /Kernel\s+Debug|WAN\s+Miniport|Microsoft\s+ISATAP|Microsoft\s+Teredo|6to4|Hyper-V\s+RAW|AF_UNIX|MSAFD|RSVP|Bluetooth\s+Device|Personal\s+Area\s+Network/i.test(
        n
      );
    const realish = out.filter((a) => !isVirtual(a.name));
    return realish.length ? realish : out.filter((a) => a.name);
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
      [
        "Connection Name",
        "NetConnectionID",
        "Имя подключения",
        "接続名",
        "ネットワーク接続名",
        "Bağlantı Adı",
        "Bağlantı adı",
      ],
      [
        "Name",
        "Namn",
        "Nombre",
        "Nome",
        "Nom",
        "Adı",
        "Имя",
        "名前",
        "デバイス名",
        "Adapter Name",
        "Adapter name",
        "Adapter",
        "アダプター名",
        "アダプタ名",
        "Ad",
        "İsim",
      ],
      [
        "Product Type",
        "Produkttyp",
        "Тип продукта",
        "Тип продукции",
        "Ürün Türü",
        "Ürün türü",
        "Tipo de produto",
        "Tipo de producto",
      ],
      ["Installed", "Instalado", "Installerat", "Установлен", "Установлено", "Установлена", "Yüklü"],
      [
        "PNP Device ID",
        "ID de périphérique Plug-and-Play",
        "ID du périphérique Plug-and-Play",
        "ID PNP-устройства",
        "ИД PNP-устройства",
        "Код PNP-устройства",
        "PNP-устройства",
        "PNP デバイス ID",
        "PNPデバイス ID",
        "PNP Aygıt Kimliği",
        "Tak ve Çalıştır Aygıt Kimliği",
        "Identificação de dispositivo PNP",
        "Identificação do dispositivo PNP",
        "Id. de dispositivo PNP",
        "PNP-enhets-ID",
      ],
      [
        "Last Reset",
        "Última redefinição",
        "Senaste återställning",
        "Последний сброс",
        "Son Sıfırlama",
      ],
      ["Index", "Índice", "Индекс", "Dizin"],
      ["Service Name", "Tjänstnamn", "Nome do serviço", "Имя службы", "Hizmet Adı"],
      [
        "IP addresses",
        "IP-адрес",
        "IP Address",
        "IP-adress",
        "IP Adresi",
        "IP adresi",
        "Endereço IP",
        "Endereços IP",
        "Adresse IP",
        /** Ukrainian (uk-UA). */
        "IP-адреса",
        "IP_адреса",
      ],
      [
        "DHCP Lease Expires",
        "Concessão DHCP Expira em",
        "Concessão DHCP expira em",
        "DHCP-аренда истекает",
        "Срок аренды DHCP истекает",
        "Дата окончания аренды DHCP",
        "DHCP Kiralama Bitişi",
        "DHCP-lånet upphör",
        /** Ukrainian (uk-UA). */
        "DHCP-оренда закінчується",
        "DHCP_оренда_закінчується",
      ],
      [
        "DHCP Lease Obtained",
        "Concessão DHCP Obtida em",
        "Concessão DHCP obtida em",
        "DHCP-аренда получена",
        "Срок аренды DHCP получен",
        "Дата получения аренды DHCP",
        "DHCP Kiralama Başlangıcı",
        "DHCP-lånet erhölls",
        /** Ukrainian (uk-UA). */
        "DHCP-оренду отримано",
        "DHCP_оренду_отримано",
      ],
      ["Driver", "Драйвер", "Drivrutin", "Sürücü", "ドライブ", "ドライバー", "ドライバ"],
      ["Media State", "Состояние среды передачи"],
      ["Connection Status", "Состояние подключения"],
      ["Operational Status", "Рабочее состояние"],
      [
        "Subnet Mask",
        "IP Subnet",
        "IP-подсеть",
        "IPv4 Subnet Mask",
        "Маска подсети",
        "Alt Ağ Maskesi",
        "IPv4 Alt Ağ Maskesi",
        "IP Alt Ağı",
        "IP alt ağı",
        "Sub-rede IP",
        "Sub-rede",
        "IP-nät",
        /** Ukrainian (uk-UA). */
        "IP-підмережа",
        "IP_підмережа",
      ],
      [
        "Default Gateway",
        "Default IP Gateway",
        "IPv4 Default Gateway",
        "Standard-gateway för IP",
        "Standardgateway för IP",
        "Gateway padrão",
        "Gateway Padrão",
        "Gateway IP padrão",
        "Gateway IP Padrão",
        "Шлюз IP по умолчанию",
        "Шлюз по умолчанию",
        "Основной шлюз",
        "Varsayılan Ağ Geçidi",
        "Varsayılan ağ geçidi",
        "Varsayılan IP Ağ Geçidi",
        "Varsayılan ip ağ geçidi",
        "デフォルト ゲートウェイ",
        "IPv4 デフォルト ゲートウェイ",
        /** Ukrainian (uk-UA). */
        "Шлюз IP за замовчуванням",
        "Шлюз_IP_за_замовчуванням",
      ],
      [
        "DHCP Enabled",
        "DHCP Habilitado",
        "DHCP Ativado",
        "DHCP är aktiverat",
        "DHCP вкл.",
        "DHCP включен",
        "DHCP 有効",
        "DHCP を有効にする",
        "DHCP Etkin",
        /** Ukrainian (uk-UA). */
        "DHCP увімк.",
        "DHCP_увімк_",
      ],
      [
        "DHCP Server",
        "Servidor DHCP",
        "Servidor de DHCP",
        "DHCP-сервер",
        "DHCP сервер",
        "Сервер DHCP",
        "DHCP サーバー",
        "DHCPサーバー",
        "DHCP Sunucusu",
        /** Ukrainian (uk-UA) — when XML tag becomes the row key. */
        "DHCP_сервер",
      ],
      [
        "Adapter Type",
        "Korttyp",
        "Tipo de adaptador",
        "Тип адаптера",
        "Bağdaştırıcı Türü",
        "アダプターの種類",
        "アダプタの種類",
        /** Ukrainian (uk-UA). */
        "Тип_адаптера",
      ],
      [
        "MAC Address",
        "MAC-adress",
        "Endereço MAC",
        "Physical Address",
        "MAC-адрес",
        "Физический адрес",
        "Fiziksel Adres",
        "MAC Adresi",
        "MAC adresi",
        "物理アドレス",
        "MAC アドレス",
        /** Ukrainian (uk-UA). */
        "MAC-адреса",
        "MAC_адреса",
      ],
      [
        "Memory Address",
        "Endereço de memória",
        "Minnesadress",
        "Bellek Adresi",
        "Bellek adresi",
        "Memory address",
      ],
      ["IRQ Channel", "Canal IRQ", "IRQ Kanalı", "IRQ kanalı", "IRQ-kanal", "IRQ Channel(s)"],
      ["Speed", "Скорость", "Hız"],
    ];

    const detailKeySet = new Set();
    /** tr-TR + ascii-fold — skips “extras” rows already surfaced under an English canonical label. */
    const detailKeyNormSet = new Set();
    for (const kg of detailKeyGroups) {
      for (const x of kg) {
        detailKeySet.add(x);
        detailKeySet.add(x.trim().toLowerCase());
        const t = x.trim();
        detailKeyNormSet.add(msinfoFieldKeyNormLower(t));
        detailKeyNormSet.add(networkFieldKeyAsciiFold(t));
      }
    }

    /** @type {{ path: string, name: string, medium: string, ipv4Display: string, ipv6Display: string, ipv6: { summary: string, lines: string[] }, details: { k: string, v: string }[], score: number, primary: boolean }[]} */
    const out = [];

    for (const { path, fields } of flat) {
      if (!isInternetConnectedAdapter(fields, path)) continue;

      const name =
        fields.Name ||
        fields.Namn ||
        fields.Nombre ||
        fields.Nome ||
        fields["Adı"] ||
        fields.Имя ||
        /** Ukrainian (uk-UA) — adapter Name row uses "Ім'я" / XML tag {@code <Ім_я>}. */
        fields["Ім'я"] ||
        fields["Імʼя"] ||
        fields["Ім_я"] ||
        fields["Назва"] ||
        fields["名前"] ||
        fields["デバイス名"] ||
        fields.Device ||
        fields.Item ||
        fields.Description ||
        getNetworkField(fields, "Adapter Name", "アダプター名", "アダプタ名", "Adı", "Nome", "Ім'я", "Назва") ||
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
        const kNormTr = msinfoFieldKeyNormLower(k.trim());
        const kFold = networkFieldKeyAsciiFold(k.trim());
        if (detailKeySet.has(k) || detailKeySet.has(kNorm)) continue;
        if (detailKeyNormSet.has(kNormTr) || detailKeyNormSet.has(kFold)) continue;
        if (/^IPv6/i.test(k)) continue;
        if (/^ip\s/.test(kFold) && /adres|address/.test(kFold) && !kFold.includes("ipv6")) continue;
        if (/dns|suffix/i.test(k.toLowerCase())) continue;
        if (details.some((d) => d.k === k)) continue;
        if (details.length < 32) details.push({ k, v: String(v).trim() });
      }

      const detailsDeduped = dedupeNetworkDetailRows(details);

      out.push({
        path,
        name: name || "Network adapter",
        medium,
        ipv4Display,
        ipv6Display,
        ipv6,
        details: detailsDeduped,
        score,
        primary: false,
      });
    }

    out.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    return out;
  }

  /** @param {unknown} adapters */
  function networkSectionNeedsTranslateHint(adapters) {
    if (!Array.isArray(adapters) || adapters.length === 0) return false;
    const parts = [];
    for (const a of adapters) {
      if (!a || typeof a !== "object") continue;
      const rec = /** @type {Record<string, unknown>} */ (a);
      for (const kk of ["name", "medium", "ipv4Display", "ipv6Display"]) {
        const v = rec[kk];
        if (v != null && String(v).trim()) parts.push(String(v));
      }
      const i6 = rec.ipv6;
      if (i6 && typeof i6 === "object" && "summary" in i6 && String(/** @type {{ summary?: string }} */ (i6).summary || "").trim()) {
        parts.push(String(/** @type {{ summary?: string }} */ (i6).summary));
      }
      const det = rec.details;
      if (Array.isArray(det)) {
        for (const row of det) {
          if (row && typeof row === "object") {
            const d = /** @type {{ k?: string, v?: string }} */ (row);
            if (d.k) parts.push(String(d.k));
            if (d.v) parts.push(String(d.v));
          }
        }
      }
    }
    const blob = parts.join(" ");
    return (
      localeScriptLooksNonEnglishListed(blob) ||
      looksLikeSpanishWindowsLatinHint(blob) ||
      looksLikePortugueseWindowsLatinHint(blob) ||
      /\bEvet\b|\bHayır\b|\bKBayt\b|\bBayt\b/i.test(blob) ||
      /(^|[\s,;:])(Sim|Não|Nao)([\s,;:\)]|$)/u.test(blob) ||
      /\bcompat[ií]vel\b/u.test(blob)
    );
  }

  /** @param {string} line */
  function extractWindowsBuildFromVersionLine(line) {
    const s = String(line || "");
    let m = s.match(/Build\s+(\d{4,6})\b/i);
    if (m) return m[1];
    m = s.match(/\bDerleme\s+(\d{4,6})\b/i);
    if (m) return m[1];
    m = s.match(/\bcompilaci[oó]n\s+(\d{4,6})\b/i);
    if (m) return m[1];
    m = s.match(/\bCompila[cç][aã]o\s+(\d{4,6})\b/i);
    if (m) return m[1];
    /** Ukrainian (uk-UA) — {@code Збірка}. */
    m = s.match(/Збірка\s+(\d{4,6})/iu);
    if (m) return m[1];
    /** Russian — {@code Сборка}. */
    m = s.match(/Сборка\s+(\d{4,6})/iu);
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
        /ストレージ.*ドライブ|ドライブ.*ストレージ/i.test(s) ||
        /Sürücü\s+[A-Z]:/i.test(s) ||
        /Diskler.*Sürücü|Depolama.*Sürücü|Depolama.*Disk|Bileşenler.*Depolama.*Disk/i.test(s) ||
        /Bileşenler\/Depolama\/Diskler/i.test(s) ||
        (/Almacenamiento/i.test(s) && /Unidades/i.test(s) && /\bUnidad\b/i.test(s)) ||
        (/Almacenamiento/i.test(s) && /Discos/i.test(s) && /\bDisco\b/i.test(s)) ||
        /Unidad local\s*\([A-Z]:/i.test(s) ||
        /(?:^|[\s/])Unidad\s+[A-Z]:/i.test(s) ||
        (/Armazenamento/i.test(s) && /Unidades/i.test(s)) ||
        (/Armazenamento/i.test(s) && /Discos/i.test(s)) ||
        (/Armazenamento/i.test(s) && /Unidades/i.test(s) && /\bUnidade\b/i.test(s)) ||
        (/Armazenamento/i.test(s) && /Discos/i.test(s) && /\bDisco\b/i.test(s)) ||
        /(?:^|[\s/])Unidade\s+[A-Z]:/i.test(s) ||
        /Lagring.*Diskar|Diskar.*Lagring|Komponenter.*Lagring|\/Lagring\/|\/Diskar\//i.test(s) ||
        (/Lagring/i.test(s) && /(?:Disk|Volym|Lokal|Enhet|enhet)/i.test(s)) ||
        /Lokal\s+disk\s*\([A-Z]:/i.test(s) ||
        /Volym\s*\([A-Z]:/i.test(s) ||
        /Disque local\s*\([A-Z]:/i.test(s) ||
        /Lecteur local\s*\([A-Z]:/i.test(s) ||
        /Lecteur\s+[A-Z]:/i.test(s) ||
        (/Composants/i.test(s) && /Stockage/i.test(s) && /(Disque|Lecteur|Disques|Volumes?)/i.test(s) && /[A-Z]:/i.test(s)) ||
        /Composants.*Stockage.*(Disque|Lecteur)/i.test(s) ||
        /Disque\s+\d+.*Lecteur.*[A-Z]:/i.test(s) ||
        (/Компоненти/i.test(s) && /Зберігання/i.test(s) && /Диски/i.test(s) && /[A-Z]:/i.test(s)) ||
        (/Зберігання/i.test(s) && /Диски/i.test(s) && /(?:Диск|Том)\b/i.test(s))
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
      const desc = `${f["Описание"] || ""} ${f["Опис"] || ""} ${f["Description"] || ""} ${f["Descripción"] || ""} ${f["Açıklama"] || ""} ${f["Beskrivning"] || ""} ${f["Model"] || ""} ${f["Modelo"] || ""} ${f["Модель"] || ""} ${f["Modeli"] || ""} ${f["モデル"] || ""} ${f["製品名"] || ""}`.toLowerCase();
      const hasModel = !!(
        f["Model"] ||
        f["Modelo"] ||
        f["Модель"] ||
        f["Modeli"] ||
        f["Model Number"] ||
        f["Номер модели"] ||
        f["モデル"] ||
        f["製品名"]
      );
      const hasDesc = !!(f["Описание"] || f["Опис"] || f["Description"] || f["Descripción"] || f["Beskrivning"] || f["説明"]);
      const sizeBlob = `${f["Size"] || ""} ${f["Размер"] || ""} ${f["Розмір"] || ""} ${f["Total Size"] || ""} ${f["Ёмкость"] || ""} ${f["Toplam Boyut"] || ""} ${f["Tamaño"] || ""} ${f["Tamanho"] || ""} ${f["サイズ"] || ""} ${f["合計サイズ"] || ""}`.trim();
      const hasSized =
        sizeBlob.length > 2 &&
        /[\d,\s]+/.test(sizeBlob) &&
        /(байт|тб|гб|tb|gb|mb|bytes|go|to|bayt|gigabayt|octetos|バイト)/i.test(sizeBlob);
      const hasSector = !!(
        f["Bytes/sector"] ||
        f["Bytes per sector"] ||
        f["Bytes por sector"] ||
        f["Байт/сектор"] ||
        f["バイト/セクター"] ||
        f["バイト／セクター"]
      );
      const diskish =
        /дисков|накопител|hard\s*disk|disk\s+drive|physical\s+drive|hdd|ssd|nvme|scsi|sata|st\d{4,}|wdc|wd\s|seagate|samsung\s+ssd|intel\s+ssd|sabit\s*disk|fiziksel|物理ディスク|固定ディスク|ハード\s*ディスク/i.test(
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
          f["Sistema de arquivos"] ||
          f["Sistema de ficheiros"] ||
          f["Файловая система"] ||
          f["Файлова система"] ||
          f["Dosya Sistemi"] ||
          f["Dosya sistemi"] ||
          f["ファイル システム"] ||
          f["ファイルシステム"] ||
          f.Filsystem ||
          f["Fil system"]
        ) ||
        (!!(f["Total Size"] || f["Gesamtgröße"] || f["Taille totale"] || f["Capacité"] || f["Размер"] || f["Полный размер"] || f["Ёмкость"] || f["Розмір"] || f["Toplam Boyut"] || f["Tamaño"] || f["Tamanho"] || f["Tamanho total"] || f["Capacidade total"] || f["合計サイズ"] || f["サイズ"] || f["総容量"] || f["Totalt utrymme"] || f["Total storlek"] || f["Volymkapacitet"] || f.Storlek) &&
          !!(
            f["Free Space"] ||
            f["Available Space"] ||
            f["Freier Speicherplatz"] ||
            f["Verfügbarer Speicherplatz"] ||
            f["Espace libre"] ||
            f["Espacio disponible"] ||
            f["Espacio libre"] ||
            f["Espaço livre"] ||
            f["Espaco livre"] ||
            f["Espaço disponível"] ||
            f["Espaco disponivel"] ||
            f["Boş Alan"] ||
            f["Boş alan"] ||
            f["Kullanılabilir Alan"] ||
            f["Kullanılabilir alan"] ||
            f["Свободно"] ||
            f["Свободное место"] ||
            f["Вільно"] ||
            f["Доступно"] ||
            f["空き領域"] ||
            f["空き容量"] ||
            f["使用可能領域"] ||
            f["使用可能な容量"] ||
            f["空きの容量"] ||
            f["未使用領域"] ||
            f["Ledigt utrymme"] ||
            f["Tillgängligt utrymme"]
          )) ||
        (/ntfs|fat32|refs|exfat/i.test(blob) && /gb|tb|bytes|mb|гб|тб|bayt|gigabayt|バイト/i.test(blob)) ||
        looksLikePhysicalDisk(f)
      );
    };

    const driveSeenKey = (/** @type {string} */ path, /** @type {Record<string, string>} */ f) => {
      const tag =
        (f["ドライブ"] ||
          f["Drive"] ||
          f["Lecteur"] ||
          f["Volume"] ||
          f.Enhet ||
          f["Unidad"] ||
          f["ディスク"] ||
          f["合計サイズ"] ||
          f["Total Size"] ||
          f["Capacité"] ||
          f["Tamaño"] ||
          f["Tamanho"] ||
          f["Диск"] ||
          f["Serial Number"] ||
          f["Numéro de série du volume"] ||
          f["Numéro de série"] ||
          f["シリアル番号"] ||
          "")
          .trim() || Object.keys(f).sort().join(",");
      return `${path}\u0001${tag}`;
    };

    /** @param {string} v */
    const looksLikeDriveSizeValue = (/** @type {string} */ v) => {
      const s = String(v || "").trim();
      if (!s || s.length < 2) return false;
      return (
        /[\d.,]/.test(s) &&
        /(tb|gb|mb|kb|bytes|байт|гб|тб|мб|кб|バイト|go|to|mo|ko|bayt|gigabayt|megabayt|terabayt|kilobayt)/i.test(
          s
        )
      );
    };

    /** Swedish/Ukrainian/Russian MSInfo lists bytes after parentheses; derive used when “Used” is absent. */
    const parseMsinfoParenBytes = (/** @type {string} */ s) => {
      /** Ukrainian {@code байтів}, Russian {@code байт/байтов}, Turkish {@code bayt}. */
      const m = String(s || "").match(
        /\(([\d\s\u00A0\u202F]+)\s*(?:byte|bytes|octets|bayt|байт(?:і?в|а|ов)?)\)/iu
      );
      if (!m) return null;
      const digits = m[1].replace(/[\s\u00A0\u202F]/g, "").replace(/\u2212/g, "-");
      try {
        return BigInt(digits);
      } catch {
        return null;
      }
    };

    const formatDerivedDriveUsed = (/** @type {string} */ totalStr, /** @type {string} */ freeStr) => {
      const tb = parseMsinfoParenBytes(totalStr);
      const fb = parseMsinfoParenBytes(freeStr);
      if (tb == null || fb == null || tb < fb) return "";
      const ub = tb - fb;
      const n = Number(ub);
      if (!Number.isFinite(n) || n < 0) return "";
      const spaced = String(ub).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
      if (n >= 1e12) {
        const t = n / 1e12;
        return `${String(t.toFixed(2)).replace(".", ",")} TB (${spaced} bytes)`;
      }
      if (n >= 1e9) {
        const g = n / 1e9;
        return `${String(g.toFixed(2)).replace(".", ",")} GB (${spaced} bytes)`;
      }
      return `${spaced} bytes`;
    };

    const driveKeyNorm = (/** @type {string} */ k) => msinfoFieldKeyNormLower(String(k || ""));

    /**
     * Turkish (and other) MSInfo column names vary; match normalized keys when exact labels miss.
     * @param {Record<string, string>} f
     */
    const pickDriveTotalSizeLoose = (/** @type {Record<string, string>} */ f) => {
      const bad =
        /boş|bos|kullanılabilir|kullanilabilir|kullanılan|kullanilan|dolu|seri|serial|^dosya|^file\s*system|^sistem/i;
      for (const [k, raw] of Object.entries(f)) {
        const v = String(raw || "").trim();
        if (!v || !looksLikeDriveSizeValue(v)) continue;
        const nk = driveKeyNorm(k);
        if (!nk || bad.test(nk)) continue;
        if (
          (nk.includes("toplam") && (nk.includes("boyut") || nk.includes("kapasite") || nk.includes("alan"))) ||
          ((nk.includes("sürücü") || nk.includes("surucu")) && nk.includes("boyut")) ||
          nk.includes("disk boyutu") ||
          nk.includes("büyüklük") ||
          nk.includes("buyukluk") ||
          (nk.includes("sabit") && nk.includes("disk") && nk.includes("boyut")) ||
          (nk.includes("birim") && nk.includes("boyut")) ||
          nk === "kapasite" ||
          nk === "boyut" ||
          ((nk.includes("tamanho") || nk.includes("capacidade")) &&
            nk.includes("total") &&
            !nk.includes("livre") &&
            !nk.includes("usado") &&
            !nk.includes("livres")) ||
          (nk.includes("tamaño") && !nk.includes("libre") && !nk.includes("disponible") && !nk.includes("usado")) ||
          ((nk.includes("totalt") || nk.includes("total")) &&
            nk.includes("utrymme") &&
            !nk.includes("ledigt") &&
            !nk.includes("tillgäng")) ||
          nk.includes("volymkapacitet") ||
          nk === "storlek" ||
          (nk.includes("storlek") && nk.includes("volym") && !nk.includes("ledig")) ||
          (nk.includes("kapacitet") &&
            !nk.includes("ledig") &&
            !nk.includes("fri") &&
            !nk.includes("tillgäng") &&
            !nk.includes("använd") &&
            !nk.includes("anvant")) ||
          (nk.includes("загальний") && (nk.includes("обсяг") || nk.includes("розмір"))) ||
          (nk.includes("повний") && nk.includes("розмір"))
        )
          return v;
      }
      return "";
    };

    /** @param {Record<string, string>} f */
    const pickDriveUsedLoose = (/** @type {Record<string, string>} */ f) => {
      for (const [k, raw] of Object.entries(f)) {
        const v = String(raw || "").trim();
        if (!v || !looksLikeDriveSizeValue(v)) continue;
        const nk = driveKeyNorm(k);
        if (
          /kullanılabilir|kullanilabilir|boş|bos|seri|serial|^dosya|^file\s*system|free|available|disponible|libre|tamaño$/i.test(
            nk
          )
        )
          continue;
        if (
          ((nk.includes("kullanılan") || nk.includes("kullanilan")) && nk.includes("alan")) ||
          (nk.includes("dolu") && nk.includes("alan"))
        )
          return v;
        if (nk.includes("belegt") || nk.includes("использ")) return v;
        if ((nk.includes("usado") && nk.includes("espacio")) || nk.includes("utilizado")) return v;
        if (
          (nk.includes("espaço") || nk.includes("espaco")) &&
          (nk.includes("usado") || nk.includes("utilizado"))
        )
          return v;
        if (
          (nk.includes("använd") || nk.includes("anvant") || nk.includes("anvand")) &&
          nk.includes("utrymme")
        )
          return v;
        if (nk.includes("зайнято") || (nk.includes("зайнят") && nk.includes("простір"))) return v;
      }
      return "";
    };

    /** @param {Record<string, string>} f */
    const pickDriveVolumeLabelLoose = (/** @type {Record<string, string>} */ f) => {
      for (const [k, raw] of Object.entries(f)) {
        const v = String(raw || "").trim();
        if (!v || looksLikeDriveSizeValue(v)) continue;
        const nk = driveKeyNorm(k);
        if (
          /seri|serial|serienummer|volym.*serienummer|dosya|sistemi|boyut|alan|kapasite|boş|bos|filesystem|partition|bölüm|açıklama|aciklama|türü|type$/i.test(
            nk
          )
        )
          continue;
        if (nk.includes("etiket")) return v;
        if ((nk.includes("nombre") && nk.includes("volumen")) || nk.includes("etiqueta")) return v;
        if ((nk.includes("nome") && nk.includes("volume")) || /r[oó]tulo/i.test(nk)) return v;
        if ((nk.includes("volym") && nk.includes("namn")) || /volymens\s+namn/i.test(nk)) return v;
        if (nk.includes("імен") && nk.includes("том")) return v;
        if (nk.includes("ім'я") && nk.includes("том")) return v;
      }
      return "";
    };

    /** @param {Record<string, string>} f */
    const pickDriveUsedFromFields = (/** @type {Record<string, string>} */ f) => {
      if (!f || typeof f !== "object") return "";
      const direct =
        displayFieldByLabels(f, [
          "Used",
          "Used(%)",
          "% Used",
          "Belegt",
          "Utilisé",
          "Используется",
          "Kullanılan Alan",
          "Kullanılan alan",
          "Kullanilan Alan",
          "Kullanilan alan",
          "Dolu Alan",
          "Dolu alan",
          "使用中",
          "使用済み",
          "使用中の容量",
          "使用済みの容量",
          "使用済み容量",
          "使用容量",
          "占有領域",
          "使用中の領域",
          "使用領域",
          "Espacio usado",
          "% usado",
          "Espaço usado",
          "Espaço utilizado",
          "Espaco usado",
          "Använt utrymme",
          "Använda utrymmet",
          "Använt",
          "Зайнято",
          "Зайнятий простір",
        ]) ||
        f["Used"] ||
        f["Used(%)"] ||
        f["% Used"] ||
        f["Belegt"] ||
        f["Utilisé"] ||
        f["Espacio usado"] ||
        f["Espaço usado"] ||
        f["Espaço utilizado"] ||
        f["Espaco usado"] ||
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
        f["Använt utrymme"] ||
        f["Använda utrymmet"] ||
        f["Зайнято"] ||
        f["Зайнятий простір"] ||
        "";
      const d = String(direct || "").trim();
      if (d) return d;
      for (const [k, v] of Object.entries(f)) {
        const kk = String(k || "").trim();
        const vv = String(v || "").trim();
        if (
          !vv ||
          /空き|使用可能|利用可能|未使用|free|available|unused|boş\s*alan|kullanılabilir|Espacio disponible|Espacio libre/i.test(kk)
        )
          continue;
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
        displayFieldByLabels(f, [
          "Volume Name",
          "Label",
          "Datenträgerbezeichnung",
          "Nom du volume",
          "Nom de volume",
          "Метка тома",
          "Метка",
          "ボリューム ラベル",
          "ボリュームラベル",
          "ボリューム名",
          "ボリューム のラベル",
          "ドライブのラベル",
          "ドライブ ラベル",
          "Birim Etiketi",
          "Birim etiketi",
          "Birim Etiket",
          "Birim Adı",
          "Birim adı",
          "Birim Adi",
          "Sürücü Etiketi",
          "Sürücü etiketi",
          "Surucu Etiketi",
          "Nombre de volumen",
          "Nombre del volumen",
          "Volymnamn",
          "Volymens namn",
          "Volymetikett",
          "Etikett",
          "Volym namn",
          "Nome do volume",
          "Rótulo do volume",
          "Nome da unidade",
          "Ім'я тому",
          "Імʼя тому",
        ]) ||
        f["Volume Name"] ||
        f["Nombre de volumen"] ||
        f["Nombre del volumen"] ||
        f["Nome do volume"] ||
        f["Rótulo do volume"] ||
        f["Volymnamn"] ||
        f["Volymens namn"] ||
        f["Volymetikett"] ||
        f.Etikett ||
        f["Label"] ||
        f["Datenträgerbezeichnung"] ||
        f["Nom du volume"] ||
        f["Nom de volume"] ||
        f["Метка тома"] ||
        f["Метка"] ||
        f["ボリューム ラベル"] ||
        f["ボリュームラベル"] ||
        f["ボリューム名"] ||
        f["ボリューム のラベル"] ||
        f["ドライブのラベル"] ||
        f["ドライブ ラベル"] ||
        f["Birim Etiketi"] ||
        f["Birim etiketi"] ||
        f["Ім'я тому"] ||
        f["Імʼя тому"] ||
        "";
      const d = String(direct || "").trim();
      if (d) return d;
      for (const [k, v] of Object.entries(f)) {
        const kk = String(k || "").trim();
        const vv = String(v || "").trim();
        if (!vv || /シリアル|serial/i.test(kk)) continue;
        if (
          /ボリューム.*(名|ラベル)|^ラベル$/i.test(kk) ||
          (/volym/i.test(kk) && /(namn|etikett)/i.test(kk)) ||
          /ім['ʼ]\s*я\s+тому/i.test(kk)
        )
          return vv;
      }
      return "";
    };

    const pushDrive = (/** @type {string} */ path, /** @type {Record<string, string>} */ f) => {
      const key = driveSeenKey(path, f);
      if (seen.has(key)) return;
      if (Object.keys(f).length < 2 || !looksLikeDisk(f)) return;
      seen.add(key);
      /**
       * Title priority: a drive-letter row beats a description, so "C: / Local Fixed Disk" renders as
       * "Drive C:". Ukrainian {@code Диск} = "C:" must therefore come before {@code Опис} = "Local Fixed Disk".
       */
      const driveLetterFromField =
        String(f["Drive"] || f["Lecteur"] || f["Unidad"] || f["Unidade"] || f["Диск"] || "").trim();
      const driveLetterMatch = driveLetterFromField.match(/^([A-Z]):?$/i);
      let title = "";
      if (driveLetterMatch) {
        title = `Drive ${driveLetterMatch[1]}:`;
      } else {
        title =
          f["Drive"] ||
          f["Lecteur"] ||
          f.Laufwerk ||
          f["Volume"] ||
          f.Enhet ||
          f["Unidad"] ||
          f["Диск"] ||
          f["Name"] ||
          f["Sürücü"] ||
          f["Yerel Disk"] ||
          f["Lokal disk"] ||
          f["Lokal enhet"] ||
          f["ドライブ"] ||
          f["ディスク"] ||
          /** Description / model fall to the BACK so a volume ("C:") is preferred over its description ("Local Fixed Disk"). */
          f["Описание"] ||
          f["Опис"] ||
          f["Модель"] ||
          (path.match(/Drive\s+[A-Z]:/i) ||
            path.match(/ドライブ\s+[A-Z]:/i) ||
            path.match(/Sürücü\s+[A-Z]:/i) ||
            path.match(/Unidad local\s*\([A-Z]:/i) ||
            path.match(/Unidad\s+[A-Z]:/i) ||
            [""])[0] ||
          path.split(" / ").pop() ||
          "Drive";
      }
      const tTrim = String(title).trim();
      // French exports often show a generic "Lecteurs" group; prefer a per-drive title when the record has a drive letter.
      if (/^Lecteurs?$/iu.test(tTrim)) {
        const letter = String(f["Lecteur"] || "").trim();
        title = letter ? `Drive ${letter}` : "Drives";
      } else if (/^Unidades?$/iu.test(tTrim)) {
        const letter =
          String(f["Unidade"] || f["Letra da unidade"] || f["Letra de unidade"] || f["Drive"] || "").trim();
        const lm = letter.match(/\b([A-Z]):/i);
        title = lm ? `Drive ${lm[1]}:` : letter || "Drives";
      } else if (f["Lecteur"]) {
        // "Lecteur: C:" should become "Drive C:" by default (English UI labels).
        const letter = String(f["Lecteur"] || "").trim();
        if (letter && !/^[A-Z]:$/i.test(String(tTrim))) title = `Drive ${letter}`;
      }
      /** Ukrainian/Russian {@code Опис: Disk drive} is generic — promote the model / drive letter when available. */
      if (/^(Disk\s+drive|Local\s+Fixed\s+Disk)$/i.test(tTrim)) {
        const dl = String(f["Диск"] || "").trim().match(/^([A-Z]):?$/i);
        if (dl) title = `Drive ${dl[1]}:`;
        else if (f["Модель"] && String(f["Модель"]).trim()) title = String(f["Модель"]).trim();
      }
      const pathDiskN = String(path || "").match(/ディスク\s*(\d+)/i);
      const titleDiskN = tTrim.match(/^ディスク\s*(\d+)$/i);
      if (titleDiskN) title = `Disk ${titleDiskN[1]}`;
      else if (/^ディスク$/i.test(tTrim) && pathDiskN) title = `Disk ${pathDiskN[1]}`;
      let fileSystem =
        displayFieldByLabels(f, [
          "File System",
          "Filesystem",
          "Dateisystem",
          "Système de fichiers",
          "Sistema de archivos",
          "Sistema de ficheiros",
          "Sistema de arquivos",
          "Файловая система",
          "Dosya Sistemi",
          "Dosya sistemi",
          "ファイル システム",
          "ファイルシステム",
          "Filsystem",
          "Fil system",
          "Файлова система",
        ]) ||
        f["File System"] ||
        f.Filesystem ||
        f.Dateisystem ||
        f["Système de fichiers"] ||
        f["Sistema de archivos"] ||
        f["Sistema de ficheiros"] ||
        f["Sistema de arquivos"] ||
        f["Файловая система"] ||
        f["Файлова система"] ||
        f["Dosya Sistemi"] ||
        f["Dosya sistemi"] ||
        f["ファイル システム"] ||
        f["ファイルシステム"] ||
        f.Filsystem ||
        f["Fil system"] ||
        "";
      let totalSize =
        displayFieldByLabels(f, [
          "Total Size",
          "Size",
          "Gesamtgröße",
          "Kapazität",
          "Kapasite",
          "Taille totale",
          "Capacité",
          "Размер",
          "Полный размер",
          "Ёмкость",
          "Розмір",
          "Загальний розмір",
          "Toplam Boyut",
          "Toplam boyut",
          "Sürücü Boyutu",
          "Sürücü boyutu",
          "Surucu Boyutu",
          "Disk Boyutu",
          "Disk boyutu",
          "Birim Boyutu",
          "Birim boyutu",
          "Toplam Alan",
          "Toplam alan",
          "合計サイズ",
          "サイズ",
          "総容量",
          "Tamaño",
          "Tamanho",
          "Tamanho total",
          "Capacidade total",
          "Totalt utrymme",
          "Total storlek",
          "Volymkapacitet",
          "Storlek",
        ]) ||
        f["Total Size"] ||
        f["Size"] ||
        f["Gesamtgröße"] ||
        f["Kapazität"] ||
        f["Taille totale"] ||
        f["Capacité"] ||
        f["Размер"] ||
        f["Полный размер"] ||
        f["Ёмкость"] ||
        f["Розмір"] ||
        f["Загальний розмір"] ||
        f["Toplam Boyut"] ||
        f["Toplam boyut"] ||
        f["Tamaño"] ||
        f["Tamanho"] ||
        f["Tamanho total"] ||
        f["Capacidade total"] ||
        f["合計サイズ"] ||
        f["サイズ"] ||
        f["総容量"] ||
        f["Totalt utrymme"] ||
        f["Total storlek"] ||
        f["Volymkapacitet"] ||
        f.Storlek ||
        "";
      let freeSpace =
        displayFieldByLabels(f, [
          "Free Space",
          "Available Space",
          "Freier Speicherplatz",
          "Verfügbarer Speicherplatz",
          "Espace libre",
          "Espace disponible",
          "Espacio disponible",
          "Espacio libre",
          "Espaço disponível",
          "Espaco disponivel",
          "Свободно",
          "Свободное место",
          "Вільно",
          "Вільний простір",
          "Доступно",
          "Boş Alan",
          "Boş alan",
          "Kullanılabilir Alan",
          "Kullanılabilir alan",
          "空き領域",
          "空き容量",
          "使用可能領域",
          "使用可能な容量",
          "空きの容量",
          "未使用領域",
          "Ledigt utrymme",
          "Tillgängligt utrymme",
          "Espaço livre",
          "Espaco livre",
        ]) ||
        f["Free Space"] ||
        f["Available Space"] ||
        f["Freier Speicherplatz"] ||
        f["Verfügbarer Speicherplatz"] ||
        f["Espace libre"] ||
        f["Espace disponible"] ||
        f["Espacio disponible"] ||
        f["Espacio libre"] ||
        f["Espaço disponível"] ||
        f["Espaco disponivel"] ||
        f["Свободно"] ||
        f["Свободное место"] ||
        f["Вільно"] ||
        f["Вільний простір"] ||
        f["Доступно"] ||
        f["Boş Alan"] ||
        f["Boş alan"] ||
        f["Kullanılabilir Alan"] ||
        f["空き領域"] ||
        f["空き容量"] ||
        f["使用可能領域"] ||
        f["使用可能な容量"] ||
        f["空きの容量"] ||
        f["未使用領域"] ||
        f["Ledigt utrymme"] ||
        f["Tillgängligt utrymme"] ||
        f["Espaço livre"] ||
        f["Espaco livre"] ||
        "";
      let used = pickDriveUsedFromFields(f);
      let volumeName = pickDriveVolumeNameFromFields(f);
      let serialNumber =
        displayFieldByLabels(f, [
          "Serial Number",
          "Volume Serial Number",
          "Seriennummer",
          "Серийный номер",
          "シリアル番号",
          "ボリューム シリアル番号",
          "Birim Seri Numarası",
          "Birim seri numarası",
          "Seri Numarası",
          "Seri numarası",
          "Número de serie",
          "Numéro de série",
          "Numéro de série du volume",
          "Serienummer",
          "Volym serienummer",
          "Volymens serienummer",
          "Número de série do volume",
          "Número de série",
          "Numero de serie do volume",
          "Серійний номер тому",
          "Серійний номер",
        ]) ||
        f["Serial Number"] ||
        f["Número de serie"] ||
        f["Volume Serial Number"] ||
        f["Numéro de série"] ||
        f["Numéro de série du volume"] ||
        f["Serienummer"] ||
        f["Volym serienummer"] ||
        f["Volymens serienummer"] ||
        f["Número de série do volume"] ||
        f["Número de série"] ||
        f["Seriennummer"] ||
        f["Серийный номер"] ||
        f["Серійний номер тому"] ||
        f["Серійний номер"] ||
        f["シリアル番号"] ||
        f["ボリューム シリアル番号"] ||
        f["Birim Seri Numarası"] ||
        f["Seri Numarası"] ||
        "";
      if (!String(totalSize).trim()) totalSize = pickDriveTotalSizeLoose(f);
      if (!String(used).trim()) used = pickDriveUsedLoose(f);
      if (!String(used).trim()) {
        const derived = formatDerivedDriveUsed(totalSize, freeSpace);
        if (derived) used = derived;
      }
      if (!String(volumeName).trim()) volumeName = pickDriveVolumeLabelLoose(f);

      // Drop stray container/header records (e.g. "Disks") that do not represent a concrete volume (no letter, no FS/serial/name).
      const driveLetterRaw = String(
        f["Drive"] ||
          f["Lecteur"] ||
          f["Letra da unidade"] ||
          f["Letra de unidade"] ||
          f["ドライブ"] ||
          f["Unidad"] ||
          f["Unidade"] ||
          f["Volume"] ||
          ""
      ).trim();
      const driveLetter =
        (driveLetterRaw.match(/\b([A-Z]):\b/i) || driveLetterRaw.match(/^([A-Z]):$/i) || [])[1] || "";
      const titleTrim = String(title || "").trim();
      const titleHasLetter = /\bDrive\s+[A-Z]:\b/i.test(titleTrim) || /^[A-Z]:$/i.test(titleTrim);
      const isGenericContainerTitle =
        /^(Disks?|Diskar|Diskler|Disk|Volumes?|Lecteurs?|Drives?)$/iu.test(titleTrim) ||
        /\/Disks\/?$/i.test(String(path || "")) ||
        /Components.*Storage.*\/Disks\/?$/i.test(String(path || ""));
      const hasConcreteDetail =
        !!String(fileSystem || "").trim() ||
        !!String(freeSpace || "").trim() ||
        !!String(used || "").trim() ||
        !!String(volumeName || "").trim() ||
        !!String(serialNumber || "").trim();
      if (!driveLetter && !titleHasLetter && isGenericContainerTitle && !hasConcreteDetail) return;

      out.push({
        title: String(title),
        fileSystem,
        totalSize,
        freeSpace,
        used,
        volumeName,
        serialNumber,
        path,
      });
    };

    /**
     * JP exports split volumes on ドライブ / ローカル ディスク (C:); physical disks repeat ディスク / ディスク 1. Spanish uses Unidad / Disco.
     * Ukrainian (uk-UA) exports use {@code Диск} as the first row of every disk record (`<Елемент>Диск</Елемент>` ↦ value `C:` for the volume, then a separate physical-disk record with `<Елемент>Опис</Елемент>` ↦ value `Disk drive`).
     */
    const driveRecordStartRe =
      /^(ドライブ|Drive|Volume|Laufwerk|ボリューム|ディスク(?:\s+\d+)?|ローカル\s*ディスク(?:\s*\([A-Z]:?\))?|Yerel\s+Disk(?:\s*\([A-Z]:?\))?|Yerel\s+disk(?:\s*\([A-Z]:?\))?|Sürücü(?:\s+[A-Z]:)?|Yerel\s+sürücü(?:\s*\([A-Z]:?\))?|Unidad|Unidade(?:\s+local(?:\s*\([A-Z]:?\))?)?|Disco(?:\s+\d+)?|Disco\s+local(?:\s*\([A-Z]:?\))?|Lokal\s+disk(?:\s*\([A-Z]:?\))?|Lokal\s+enhet(?:\s*\([A-Z]:?\))?|Volym(?:\s+\d+)?|Enhet|Lecteur|Lecteurs|Disque\s+local|Диск(?:\s+\d+)?|Том(?:\s+\d+)?|Опис|Описание)$/iu;
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
          !/Storage|Запоминающ|Накопител|Диски|Компоненты|ストレージ|ディスク|ドライブ|ボリューム|コンポーネント|Depolama|Diskler|Bileşenler|Almacenamiento|Armazenamento|Unidades|Unidade|Discos|Lagring|Diskar|Volym|Komponenter|Maskinvaru|Enhet/i.test(
            p
          ) ||
          !/Disks?|Logical|Drive|Partition|Диск|Том|ドライブ|ディスク|ボリューム|パーティション|Sürücü|Disk|Bölüm|Unidad|Unidade|Disco|Lokal|Lagring/i.test(p)
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
      "Nombre",
      "Item",
      "Program",
      "Programme",
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
      /** Ukrainian (uk-UA) MSInfo Startup Programs row tags. */
      "Програма",
      "Назва",
      "Елемент автозавантаження",
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
      /** Ukrainian XML tags use underscores (e.g. {@code Програма}). */
      if (/^програм/i.test(kt) && String(v || "").trim()) return String(v).trim();
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
      "Commande",
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
      /** Ukrainian — same word as Russian but appears as a sibling tag in {@code <Data>}. */
      "Команда запуску",
      "Командний рядок",
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
      /** Ukrainian (uk-UA) startup programs Location column. */
      "Розташування",
      "Розміщення",
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
      if (/^розташ/i.test(kt) && String(v || "").trim()) return String(v).trim();
      if (/^розміщ/i.test(kt) && String(v || "").trim()) return String(v).trim();
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
      /** Ukrainian (uk-UA) startup programs User column. */
      "Користувач",
      "Ім'я користувача",
      "Імʼя користувача",
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
      if (/^користув/i.test(kt) && String(v || "").trim()) return String(v).trim();
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
        /Startup Programs|Startup\s*Command|Autostart|Autostartprogramme|Programme beim Start|Programmes au démarrage|Programmes de démarrage|Programas de inicio|Programas de inicialização|Programas de arranque|Programmi di avvio|Autostart-programmer|Autostartprogrammer|Oppstartsprogrammer|Käynnistysohjelmat|Opstartprogramma|Opstartprogramma's|Programy startowe|Başlangıç programları|自動実行|スタートアップ\s*プログラム|スタートアッププログラム|スタートアップ|啟動|启动|자동 실행|Käivitusprogrammid|Rendszerindító|Program de pornire|Spouštěcí programy|Spouštěcí aplikace|Автозагрузка|автозагруз|элементы автозагруз|элемент автозагруз|Программы в автозагрузке|Программы автозагрузки|Программ автозагрузки|Запуск программ|Автоматично\s+завантажувані\s+програми|автозавантаж|Автозавантаження|启动程序|CurrentVersion\s*[/\\]\s*Run|\/\s*Run\s*(\/|$)/i.test(
          s
        ) ||
        /^(Элементы автозагрузки|Элемент автозагрузки|Программы в автозагрузке|Программы автозагрузки|Автозагрузка|Запуск программ|Автоматично\s+завантажувані\s+програми|Автозавантаження|Startup Programs|Autostart|Käynnistysohjelmat|Opstartprogramma|Programy startowe|スタートアップ\s*プログラム|スタートアッププログラム)$/i.test(
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
        /^(Элементы автозагрузки|Элемент автозагрузки|Программы в автозагрузке|Программы автозагрузки|Автозагрузка|Запуск программ|Автоматично\s+завантажувані\s+програми|Автозавантаження|Startup Programs|Autostart|Käynnistysohjelmat|Opstartprogramma|Programy startowe|スタートアップ\s*プログラム|スタートアッププログラム)$/i.test(
          leaf
        )
      );
    };

    /** Ukrainian XML uses {@code <Програма>} (no underscore) as the first sibling element of {@code <Data>}. */
    const startupRecordStartRe =
      /^(名前|名称|表示名|スタートアップ項目|スタートアップ\s*項目|Startup\s*Item|Item|Program|Programme|Nombre|Elemento|プログラム|Програма|Назва)$/i;

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
        /** Ukrainian (uk-UA) MSInfo services row tag. */
        f["Стан"] ||
        f["Поточний стан"] ||
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
        f["Durumu"] ||
        f.Tillstånd ||
        f.Tillstand ||
        f["Nuvarande tillstånd"] ||
        f["Aktuellt tillstånd"] ||
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
        const ktn = normalizeMsinfoItemLabel(kt.replace(/_/g, " "));
        const vv = String(v || "").trim();
        if (!vv || /^недоступно$/i.test(vv)) continue;
        if (
          /^(state|status|zustand|состояни|статус|текущ|état|estado|stato|stan|tila|tilstand|tillstånd|tillstand|állapot|durum|durumu|κατάσταση|상태|状态|狀態|状態|現在の状態|الحالة)/i.test(
            ktn
          ) ||
          /^durum$/iu.test(ktn)
        )
          return vv;
        if (/^состоян/i.test(ktn) && !/шаблон|template/i.test(ktn)) return vv;
        /** Ukrainian (uk-UA) — {@code Стан} / {@code Поточний стан}. */
        if (/^стан$/iu.test(ktn) || /^поточний\s+стан$/iu.test(ktn)) return vv;
      }
      const ovSt = rowLabelValueFromMsInfoFields(f);
      if (ovSt.lab && ovSt.val) {
        const l = normalizeMsinfoItemLabel(ovSt.lab);
        const vv = String(ovSt.val).trim();
        if (vv && !/^недоступно$/i.test(vv)) {
          if (
            /^(state|status|zustand|состояни|статус|текущ|état|estado|stato|stan|tila|tilstand|tillstånd|tillstand|állapot|durum|durumu|κατάσταση|상태|状态|狀態|状態|現在の状態|الحالة)/i.test(
              l
            ) ||
            /^состоян/i.test(l)
          )
            return vv;
        }
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
        f.Starttyp ||
        f["Startläge"] ||
        f["Start läge"] ||
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
        f["Mode_de_démarrage"] ||
        f["Mode_de_demarrage"] ||
        f["Mode de démarrage"] ||
        f["Başlangıç türü"] ||
        f["Başlangıç Türü"] ||
        f["Başlangıç_Modu"] ||
        f["Başlangıç_modu"] ||
        f["Baslangic Modu"] ||
        f["Tipo de arranque"] ||
        f["Tipo de inicialização"] ||
        f["Modo de inicialização"] ||
        f["Modo_inicialização"] ||
        f["Modo_inicializacao"] ||
        f["Tipo_de_inicialização"] ||
        f["Tipo_de_inicializacao"] ||
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
        /** Ukrainian (uk-UA) startup type tag (XML uses underscores). */
        f["Режим_запуску"] ||
        f["Режим запуску"] ||
        f["Тип запуску"] ||
        f["Тип_запуску"] ||
        "";
      const d = String(direct || "").trim();
      if (d && !/^недоступно$/i.test(d)) return d;
      for (const [k, v] of Object.entries(f)) {
        const kt = String(k || "").trim();
        const vv = String(v || "").trim();
        if (!vv || /^недоступно$/i.test(vv)) continue;
        if (
          /^(startup|start\s*type|starttyp|startläge|start\s*läge|запуск|тип\s*запуска|typ\s*uruchomienia|spouštěcí|käynnistys|käivitus|opstart|tipo\s*de\s*inicio|tipo\s*di\s*avvio|tipo\s*(de\s+)?inicializ|modo\s*(de\s+)?inicializ|type\s*de\s*démarrage|başlangıç|baslangic|indítás|tip\s*pornire|τύπος\s*εκκίνησης|시작|启动|啟動|起動|スタート|نوع)/i.test(
            kt.replace(/_/g, " ")
          )
        )
          return vv;
        if (/起動/.test(kt) && /(種類|モード|タイプ)/.test(kt)) return vv;
        if (/^режим/i.test(kt) && /запуск/i.test(kt)) return vv;
        if (/^тип/i.test(kt) && /запуск/i.test(kt)) return vv;
        /** Ukrainian XML tag with underscores (e.g. {@code Режим_запуску}). */
        const ktNorm = kt.replace(/_/g, " ");
        if (/^режим\s+запуску$/iu.test(ktNorm) || /^тип\s+запуску$/iu.test(ktNorm)) return vv;
      }
      /** pt-BR / intl.: column title may be truncated ({@code Modo_i…}) or differ; match known startup *values* on plausible keys. */
      const looksLikeWinServiceStartModeVal = (/** @type {string} */ vv) =>
        /^(autom[aá]tico|automatico|manual|desabilitado|desativado|delayed\s*auto|boot|system|automatic|disabled|automatisk|manuell|inaktiverad|inaktiverat|fördröjd\s+autostart|fordrojd\s+autostart)\b/i.test(
          String(vv || "").trim()
        );
      const startupModeKeyish = (/** @type {string} */ k) => {
        const kn = String(k || "")
          .replace(/_/g, " ")
          .trim()
          .toLowerCase();
        if (
          /^(estado|status|state|nome|name|nome_para|service\s*name|servi[cç]o|caminho|path|pid|processo|controle|logon|exibi)/i.test(
            kn
          )
        )
          return false;
        return /inicializ|startup|start\s*type|starttyp|startläge|modo|tipo|arranque|boot\b/i.test(kn);
      };
      for (const [k, v] of Object.entries(f)) {
        const vv = String(v || "").trim();
        if (!vv || /^недоступно$/i.test(vv)) continue;
        if (!looksLikeWinServiceStartModeVal(vv)) continue;
        if (startupModeKeyish(k)) return vv;
      }
      const ovSm = rowLabelValueFromMsInfoFields(f);
      const lSm = normalizeMsinfoItemLabel(ovSm.lab);
      if (ovSm.val && /^(startup|start\s*type|starttyp|startläge|typ\s+för\s+start)$/iu.test(lSm))
        return String(ovSm.val).trim();
      return "";
    };

    /** Path leaf or bogus “name” rows that are the Services category title, not a service. */
    const isMsinfoServiceSectionTitleName = (/** @type {string} */ n) =>
      /^(hizmetler|services|dienste|servicios|serviços|servizi|службы|сервисы|palvelut|tjenester|tjänster|usługi|服务|服務|서비스|サービス|実行中のサービス|起動しているサービス|çalışan\s+hizmetler|calisan\s+hizmetler)$/iu.test(
        String(n || "").trim()
      );

    /** @param {Record<string, string>} f @param {string} pathLeaf */
    const pickServiceNameFromFields = (f, pathLeaf) => {
      if (!f || typeof f !== "object") {
        const pl = String(pathLeaf || "").trim();
        return isMsinfoServiceSectionTitleName(pl) ? "" : pl;
      }
      const raw = String(
        f["Görünen_Ad"] ||
          f["Görünen_ad"] ||
          f["Gorunen_Ad"] ||
          f["Выводимое_имя"] ||
          f["Выводимое имя"] ||
          /** Ukrainian (uk-UA) services row tags. {@code Коротке_ім_я} is the localized "Display name". */
          f["Коротке_ім_я"] ||
          f["Коротке ім'я"] ||
          f["Коротке імʼя"] ||
          f["Відображуване ім'я"] ||
          f["Відображуване імʼя"] ||
          f["Відображуване_ім_я"] ||
          f["Display Name"] ||
          f["Anzeigename"] ||
          f["Weergavenaam"] ||
          f["Visningsnavn"] ||
          f["Visningsnamn"] ||
          f["Nom d'affichage"] ||
          f["Nom d\u2019affichage"] ||
          f["Nom_complet"] ||
          f["Nom complet"] ||
          f["Tjänstnamn"] ||
          f["Tjanstnamn"] ||
          f["Näyttönimi"] ||
          f["Zobrazovaný název"] ||
          f["Zobrazovaný názov"] ||
          f["Wyświetlana nazwa"] ||
          f["Megjelenítendő név"] ||
          f["Nume afișat"] ||
          f["Nome visualizzato"] ||
          f["Nome de exibição"] ||
          f["Nome de Exibição"] ||
          f["Nome_para_exibição"] ||
          f["Nome_para_exibicao"] ||
          f["Nome_de_exibição"] ||
          f["Nome_de_exibicao"] ||
          f["Nombre para mostrar"] ||
          f.Nombre ||
          f["Görünen Ad"] ||
          f["Görünen ad"] ||
          f["Hizmet Adı"] ||
          f["Hizmet adı"] ||
          f["Adı"] ||
          f["Adi"] ||
          f["Εμφανιζόμενο όνομα"] ||
          f["サービス名"] ||
          f["表示名"] ||
          f["名前"] ||
          f["표시 이름"] ||
          f["显示名称"] ||
          f["顯示名稱"] ||
          f["الاسم المعروض"] ||
          f.Name ||
          f["Visningsnamn"] ||
          f["Visnings namn"] ||
          f["Tjänstnamn"] ||
          f["Tjanstnamn"] ||
          f["Имя"] ||
          f["Service Name"] ||
          f["Dienstname"] ||
          f.Service ||
          f["Отображаемое имя"] ||
          f["Имя службы"] ||
          f["Название службы"] ||
          pathLeaf ||
          ""
      ).trim();
      let nameOut = raw;
      if (!nameOut && f && typeof f === "object") {
        for (const [k, v] of Object.entries(f)) {
          const vv = String(v || "").trim();
          if (!vv || vv.length > 220) continue;
          const kn = String(k || "")
            .replace(/_/g, " ")
            .trim();
          if (
            /^(görünen|gorunen|display\s*name|anzeigename|weergavenaam|nombre\s+para\s+mostrar|nom\s+du\s*service|nom\s*complet|nome\s+de\s+exibi[cç][aã]o|nome\s+para\s+exibi[cç][aã]o|nome\s+para\s+exibicao)\b/i.test(
              kn
            )
          ) {
            nameOut = vv;
            break;
          }
        }
        if (!nameOut) {
          const ovNm = rowLabelValueFromMsInfoFields(f);
          const labNm = normalizeMsinfoItemLabel(ovNm.lab);
          if (
            ovNm.val &&
            /^(visningsnamn|tjänstnamn|tjanstnamn|display\s*name|service\s*name)$/iu.test(labNm)
          )
            nameOut = String(ovNm.val).trim();
        }
      }
      if (isMsinfoServiceSectionTitleName(nameOut)) return "";
      return nameOut;
    };

    /** @param {Record<string, string>} f */
    const pickServiceKeyNameFromFields = (f) => {
      if (!f || typeof f !== "object") return "";
      const direct =
        f["Service Name"] ||
        f["Dienstname"] ||
        f.Service ||
        f.Name ||
        f["Nom"] ||
        f["Nome"] ||
        f["Nombre"] ||
        f["Имя"] ||
        /** Ukrainian (uk-UA) MSInfo {@code Ім_я} key column. */
        f["Ім_я"] ||
        f["Ім'я"] ||
        f["Імʼя"] ||
        f["Назва"] ||
        f["サービス名"] ||
        f["服务名称"] ||
        f["服務名稱"] ||
        f["서비스 이름"] ||
        "";
      const d = String(direct || "").trim();
      if (d && d.length <= 120 && /^[\w.-]+$/.test(d)) return d;
      // Some exports embed it as a generic "Name" cell but include spaces; keep only plausible token.
      if (d && d.length <= 120) {
        const m = d.match(/\b[A-Za-z0-9_.-]{2,}\b/);
        return m ? m[0] : "";
      }
      return "";
    };

    /** @param {string} st */
    const isRunningServiceState = (st) => {
      const s = String(st || "").trim();
      if (!s || /^недоступно$/i.test(s)) return false;
      return (
        /\brunning\b/i.test(s) ||
        /\bRUNNING\b/.test(s) ||
        /^started$/i.test(s) ||
        /\bпрацює\b/i.test(s) ||
        /\bвиконується\b/i.test(s) ||
        /\bзапущено\b/i.test(s) ||
        /\bактивна\b/i.test(s) ||
        /\bgestartet\b/i.test(s) ||
        /\bwird ausgeführt\b/i.test(s) ||
        /\bläuft\b/i.test(s) ||
        /\ben cours d['\u2019]exécution\b/i.test(s) ||
        /\bfuncionando\b/i.test(s) ||
        /\ben ejecuci[oó]n\b/i.test(s) ||
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
        /\bstartad\b/i.test(s) ||
        /\bigång\b/i.test(s) ||
        /\bi\s+gång\b/i.test(s) ||
        /\bkäynnissä\b/i.test(s) ||
        /\bkjører\b/i.test(s) ||
        /\bEm execução\b/i.test(s) ||
        /em\s+execu[cç][aã]o/i.test(s) ||
        /\bçalışıyor\b/i.test(s) ||
        /\bçalisiyor\b/i.test(s) ||
        /\bbaşlatıldı\b/i.test(s) ||
        /\bbaslatildi\b/i.test(s) ||
        /\betkin\b/i.test(s) ||
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
      if (!msinfoPathLooksLikeSoftwareEnvironment(p)) return false;
      if (
        /startup|autostart|автозагруз|автоматично завантажувані|планировщик|task\s*scheduler|scheduled\s*tasks|tâches planifiées|geplante tasks|スタートアップ\s*プログラム|スタートアッププログラム/i.test(
          p
        )
      )
        return false;
      if (/print\s*spooler\s*drivers|enumerators|принтер|spooler|druckertreiber/i.test(p)) return false;
      if (/системные драйверы|системні драйвери|system\s*drivers/i.test(p)) return false;
      if (/Drivers$|Druckertreiber$/i.test(p)) return false;
      const parts = pathParts(p);
      const isServicesLeafSegment = (/** @type {string} */ seg) => {
        const s0 = String(seg || "").trim();
        if (!s0) return false;
        if (
          /^(services|dienste|servicios|serviços|servizi|службы|сервисы|запущенные\s+службы|работающие\s+службы|служби|palvelut|tjenester|tjänster|usługi|الخدمات|服务|服務|서비스|サービス|実行中のサービス|起動しているサービス|teenused|υπηρεσίες|szolgáltatások|servicii|služby|käynnissä\s+olevat\s+palvelut|uruchomione\s+usługi|Körande\s+tjänster|Kör\s+tjänster)$/iu.test(
            s0
          )
        )
          return true;
        if (/^hizmetler\b/i.test(s0) || /^servisler\b/i.test(s0)) return true;
        if (/^çalışan\s+hizmetler\b/iu.test(s0) || /^calisan\s+hizmetler\b/iu.test(s0)) return true;
        return false;
      };
      const idx = parts.findIndex((s) => isServicesLeafSegment(s));
      return idx >= 0;
    };

    /** Some pt-BR exports use column tags like {@code Nome_para_exibição} (underscores) instead of spaces. Ukrainian uses {@code Коротке_ім_я}. */
    const serviceRecordStartRe =
      /^(表示名|サービス名|Display Name|Service Name|サービス\s*名|Отображаемое имя|Имя службы|Имя\s*службы|Коротке_ім_я|Коротке\s+ім'я|Коротке\s+імʼя|Відображуване\s+ім'я|Відображуване_ім_я|Dienstname|Nom du service|Nom d['\u2019]affichage|Nom_complet|Nom\s+complet|Nombre del servicio|Nome de exibição|Nome de Exibição|Nome_para_exibição|Nome_para_exibicao|Nome_de_exibição|Nome_de_exibicao|Görünen_Ad|Görünen_ad|Gorunen_Ad|Görünen\s+Ad|Görünen\s+ad|Görüntülenen\s+Ad|Hizmet\s+Adı|Hizmet\s+adı|Hizmetin\s+görüntülenen\s+adı|Visningsnamn|Visnings\s+namn|Tjänstnamn|Tjanstnamn)$/iu;

    for (const p of [...new Set(kvs.map((k) => k.path))]) {
      if (!isServicesSectionPath(p)) continue;
      const fieldMaps = chunkKvsPlainSectionRecords(kvs, p, serviceRecordStartRe, 2);
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
        const keyName = pickServiceKeyNameFromFields(f);
        all.push({
          name: String(name),
          state: String(state),
          startMode: String(startMode),
          path: p,
          keyName: String(keyName),
        });
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
      const keyName = pickServiceKeyNameFromFields(f);
      all.push({
        name: String(name),
        state: String(state),
        startMode: String(startMode),
        path: r.path,
        keyName: String(keyName),
      });
    }

    const running = all.filter((s) => {
      if (isRunningServiceState(s.state || "")) return true;
      const st = String(s.state || "").trim();
      if (st && /^недоступно$/i.test(st)) return false;
      const p = String(s.path || "");
      return (
        !!(s.name || "").trim() &&
        (/\b(запущенн[\s\w,.-]{0,40}служб|работающ[\s\w,.-]{0,40}служб)\b/i.test(p) ||
          /実行中のサービス|起動しているサービス/.test(p) ||
          /çalışan\s+hizmetler|calisan\s+hizmetler/i.test(p) ||
          /Körande\s+tjänster|kör\s+tjänster|Igång\s+tjänster/i.test(p) ||
          /en\s+cours\s+d['\u2019]ex[ée]cution|Services en cours|services\s+en\s+cours/i.test(p))
      );
    });
    return { all: all.slice(0, 800), running: running.slice(0, 400) };
  }

  /**
   * @typedef {{ time: string, type: string, details: string, severity: 'error'|'warning'|'info', category: string, sourceTitle: string, path: string }} WerTimelineEntry
   */

  /** Milliseconds from 1601-01-01 UTC to 1970-01-01 UTC (for Windows FILETIME). */
  const WER_FILETIME_EPOCH_MS = 11644473600000;

  /**
   * Parse WER/MSInfo hex timestamps: 32-bit {@code 0x........} as Unix seconds;
   * wider values as 100-ns FILETIME intervals since 1601-01-01 UTC.
   * @param {string} hexToken e.g. {@code 0x6d10fba1} or {@code 0x1DCC3DC2788568D}
   * @returns {Date | null}
   */
  function werHexTimestampToDate(hexToken) {
    const s = String(hexToken || "").trim();
    const m = s.match(/^0x([0-9a-f]+)$/i);
    if (!m) return null;
    const bits = BigInt("0x" + m[1]);
    const max32 = 0xffffffffn;
    if (bits <= max32) {
      const sec = Number(bits);
      const d = new Date(sec * 1000);
      if (!isNaN(d.getTime()) && d.getUTCFullYear() >= 1990 && d.getUTCFullYear() <= 2100) return d;
      return null;
    }
    const ms = Number(bits / 10000n - BigInt(WER_FILETIME_EPOCH_MS));
    if (!Number.isFinite(ms)) return null;
    const d2 = new Date(ms);
    if (!isNaN(d2.getTime()) && d2.getUTCFullYear() >= 1990 && d2.getUTCFullYear() <= 2100) return d2;
    return null;
  }

  /**
   * Extract an event time from WER detail text (hex Time stamp, FILETIME start time, localized labels).
   * @param {string} blob
   * @returns {Date | null}
   */
  function werExtractEventDateFromText(blob) {
    const t = String(blob || "");
    if (!t.trim()) return null;
    /** Prefer exception time, then localized stamps, then process FILETIME (often start time). */
    const labeled = [
      /Time\s+stamp\s*:\s*(0x[0-9a-f]+)/i,
      /carimbo\s+de\s+data\/hora\s*:\s*(0x[0-9a-f]+)/i,
      /Faulting\s+application\s+start\s+time\s*:\s*(0x[0-9a-f]+)/i,
      /Hora\s+de\s+in[ií]cio\s+do\s+aplicativo\s+com\s+falha\s*:\s*(0x[0-9a-f]+)/i,
      /Timestamp\s*:\s*(0x[0-9a-f]+)/i,
    ];
    for (const re of labeled) {
      const m = t.match(re);
      if (m && m[1]) {
        const d = werHexTimestampToDate(m[1]);
        if (d) return d;
      }
    }
    const generic = /\b(0x[0-9a-f]{8,16})\b/gi;
    let best = null;
    let mm;
    while ((mm = generic.exec(t)) !== null) {
      const d = werHexTimestampToDate(mm[1]);
      if (d && (!best || d.getTime() < best.getTime())) best = d;
    }
    return best;
  }

  /**
   * Normalize WER row time + body into an ISO timestamp when possible (fixes “Unknown time” when only hex appears in Details).
   * @param {string} rawTime
   * @param {string} type
   * @param {string} details
   * @returns {string} ISO string or best-effort parseable string, else original / empty
   */
  function werResolveWerTimeString(rawTime, type, details) {
    const r = String(rawTime || "").trim();
    const blob = `${r}\n${String(type || "")}\n${String(details || "")}`;
    if (r && r !== "Unknown time") {
      const p = Date.parse(r);
      if (!Number.isNaN(p)) return new Date(p).toISOString();
    }
    const fromHex = werExtractEventDateFromText(blob);
    if (fromHex) return fromHex.toISOString();
    return r;
  }

  /**
   * @param {{ time: string, type: string, details: string }} e
   * @returns {Date | null}
   */
  function werEntryToEventDate(e) {
    const p = Date.parse(e.time);
    if (!Number.isNaN(p)) return new Date(p);
    return werExtractEventDateFromText(`${e.time}\n${e.type}\n${e.details}`);
  }

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
    const hit = werFirstFieldMatch(fields, [
      /^time$/i,
      /^heure$/i,
      /^durée$/i,
      /^duree$/i,
      /^hora$/i,
      /^zeit$/i,
      /^data\s*[\/\u2215]\s*ora$/i,
      /^fecha$/i,
      /^時間$/i,
      /^时间$/i,
      /^время$/i,
      /^время_/i,
      /^время\b/i,
      /** Ukrainian (uk-UA) WER row tag — XML element name {@code <Час>}. */
      /^час$/iu,
      /^czas$/i,
      /^čas$/i,
      /^tid$/i,
      /^tidspunkt$/i,
      /^saat$/iu,
      /^aeg$/i,
      /^kellonaika$/i,
      /^وقت$/i,
      /^日時$/i,
      /^時刻$/i,
      /^記録日時$/i,
      /^記録された日時$/i,
      /** pt-BR / pt MSInfo WER table (“Data e hora”, “Carimbo de data/hora”). */
      /^data\s+e\s+hora$/i,
      /^carimbo\s+de\s+data\/hora$/i,
      /^carimbo\s+de\s+data\s+e\s+hora$/i,
      /^carimbo\s+de\s+data$/i,
    ]);
    if (hit) return hit;
    for (const [k, v] of Object.entries(fields)) {
      const vv = String(v || "").trim();
      if (!vv) continue;
      const kn = msinfoFieldKeyNormLower(k);
      if (
        kn === "tid" ||
        kn === "saat" ||
        kn === "time" ||
        kn === "hora" ||
        kn === "час" ||
        kn === "durée" ||
        kn === "duree" ||
        kn === "data e hora" ||
        kn === "data e hora do evento" ||
        (kn.includes("data") && kn.includes("hora") && kn.length < 48)
      )
        return vv;
    }
    for (const [k, v] of Object.entries(fields)) {
      const vv = String(v || "").trim();
      if (!vv || vv.length > 500000) continue;
      const d = werExtractEventDateFromText(vv);
      if (d) return d.toISOString();
    }
    return "";
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
        /** Ukrainian (uk-UA) WER row tag (also matched generically below as {@code тип}). */
        /^тип$/iu,
        /^fehlertyp$/i,
        /^fault\s*bucket$/i,
        /^bucket\s*id$/i,
        /^tyyppi$/i,
        /^tür$/iu,
        /^typ\s+problemu$/i,
        /^type\s+de\s+probl/i,
        /^tipo\s+de\s+problema$/i,
        /^tipo\s+di\s+problema$/i,
        /^probleemtype$/i,
        /^probleemtypen$/i,
        /^nome\s+do\s+evento$/i,
        /^tipo\s+de\s+evento$/i,
      ]) || "";
    if (t) return t;
    for (const [k, v] of Object.entries(fields)) {
      const vv = String(v || "").trim();
      if (!vv) continue;
      const kn = msinfoFieldKeyNormLower(k);
      if (
        kn === "typ" ||
        kn === "tür" ||
        kn === "type" ||
        kn === "tipo" ||
        kn === "nome do evento" ||
        kn === "tipo de evento"
      )
        return vv;
    }
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
        /** Turkish MSInfo — “Details” column (not {@code Açıklama}). */
        /^ayrıntılar$/iu,
        /^ayrintilar$/iu,
        /** Ukrainian (uk-UA) WER row tag — {@code <Докладно>}. */
        /^докладно$/iu,
        /^відомості$/iu,
        /^інформація$/iu,
        /^information$/i,
        /^informações$/iu,
        /^informacoes$/iu,
      ]) || "";
    if (d) return d;
    for (const [k, v] of Object.entries(fields)) {
      const vv = String(v || "").trim();
      if (!vv) continue;
      const kn = msinfoFieldKeyNormLower(k);
      const kf = networkFieldKeyAsciiFold(k);
      if (
        kn === "information" ||
        kn === "informações" ||
        kn === "informacoes" ||
        kn === "detalhes" ||
        kn === "ayrıntılar" ||
        kn === "details" ||
        kn === "detalles" ||
        kn === "докладно" ||
        kn === "відомості" ||
        kn === "інформація" ||
        kf === "ayrintilar"
      )
        return vv;
    }
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
      /appcrash|application|\.exe|faulting\s*application|app\s*error|application\s*hang|ошибк.*приложен|приложени.*ошиб|сбой\s*прилож|uygulama\s+askıda|uygulama\s+askida|uygulama\s+hatası|hatalı\s+uygulama|çalışmayı\s+durdurdu|çalismayi\s+durdurdu|aplicación\s+con\s+errores|aplicacion\s+con\s+errores|dejó\s+de\s+interactuar|dejo\s+de\s+interactuar|dejó\s+de\s+funcionar|dejo\s+de\s+funcionar|informe\s+de\s+errores/i.test(
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
      /appcrash|application\s*error|exception|fault|driver\s*stopped|stopped\s*responding|ошибк.*приложен|исключен|сбой|aplicación\s+con\s+errores|aplicacion\s+con\s+errores|dejó\s+de\s+interactuar|dejo\s+de\s+interactuar/i.test(
        x
      )
    )
      return "warning";
    return "info";
  }

  /** @param {string} time @param {string} type @param {string} details @param {string} path @param {string} sourceTitle */
  function werMakeEntry(time, type, details, path, sourceTitle) {
    const resolved = werResolveWerTimeString(time, type, details).trim();
    const ti = resolved || (time || "").trim() || "Unknown time";
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
      /^data\s+e\s+hora$/i,
      /^carimbo\s+de\s+data\/hora$/i,
      /^carimbo\s+de\s+data\s+e\s+hora$/i,
      /** Turkish WER timeline table (“Saat” starts each row in MSInfo). */
      /^saat$/iu,
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
      if (anchorRes.some((re) => re.test(it))) return true;
      const kn = msinfoFieldKeyNormLower(it);
      return (
        kn === "saat" ||
        kn === "time" ||
        kn === "hora" ||
        kn === "data e hora" ||
        kn.startsWith("время") ||
        (kn.includes("data") && kn.includes("hora") && kn.length < 48)
      );
    };

    /** @type {Record<string, string>[]} */
    const chunks = [];
    /** @type {Record<string, string>} */
    let cur = {};
    for (const k of pathKvs) {
      const item = (k.item || "").trim();
      if (!item) continue;
      if (isAnchor(item) && Object.keys(cur).length) {
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
      const d = werEntryToEventDate(e);
      if (d && !isNaN(d.getTime())) dates.push(d);
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
    /**
     * True when Item/Value rows look like the WER timeline table even if the category path string
     * is an uncommon Turkish (or mixed) variant not listed in {@code pathOk}.
     * @param {{ path: string, item: string, value: string }[]} pathKvs
     */
    function pathLooksLikeWerFromKvs(pathKvs) {
      if (!pathKvs || pathKvs.length < 3) return false;
      let timeCol = 0;
      let typeCol = 0;
      let detailCol = 0;
      const blob = pathKvs.map((k) => `${k.item}\t${k.value}`).join("\n");
      const bl = blob.toLowerCase();
      if (
        /hata\s+demeti|olay\s+adı|olay\s+adi|hatalı\s+uygulama|hatali\s+uygulama|fault\s*bucket|problem\s*signature|appcrash|radar_|bex\d|windows\s+error\s+reporting|application\s+error|application\s*hang|uygulama\s+askıda|uygulama\s+askida|windows\s+ile\s+birlikte\s+çalışmayı|windows\s+ile\s+birlikte\s+calismayi|informes?\s+de\s+errores\s+de\s+windows|contenedor\s+de\s+errores|firma\s+del\s+problema|nombre\s+del\s+evento|aplicación\s+con\s+errores|aplicacion\s+con\s+errores|dejó\s+de\s+interactuar|dejo\s+de\s+interactuar|fel\s+på\s+programnamn|fel-bucket|fel\s+bucket|händelsenamn|handelsenamn|windows\s+felrapportering|relat[oó]rios?\s+de\s+(?:erros?|problemas)\s+do\s+windows|assinatura\s+do\s+problema|cont[eê]iner\s+de\s+erros|nome\s+do\s+evento|informa[cç][oõ]es\s+sobre\s+o\s+problema|&#x000d;&#x000a;|&#x000d|&#x000a/i.test(
          bl
        )
      )
        return true;
      for (const k of pathKvs) {
        const it = (k.item || "").trim();
        if (!it) continue;
        const kn = msinfoFieldKeyNormLower(it);
        const kf = networkFieldKeyAsciiFold(it);
        if (
          kn === "tid" ||
          kn === "saat" ||
          kn === "time" ||
          kn === "hora" ||
          kn === "час" ||
          kn === "durée" ||
          kn === "duree" ||
          kn === "data e hora" ||
          kn === "data e hora do evento" ||
          (kn.includes("data") && kn.includes("hora") && kn.length < 48)
        )
          timeCol++;
        if (
          kn === "typ" ||
          kn === "tür" ||
          kn === "type" ||
          kn === "tipo" ||
          kn === "тип" ||
          kn === "nome do evento" ||
          kn === "tipo de evento"
        )
          typeCol++;
        if (
          kn === "information" ||
          kn === "informações" ||
          kn === "informacoes" ||
          kn === "ayrıntılar" ||
          kn === "details" ||
          kn === "détails" ||
          kn === "details" ||
          kn === "detalles" ||
          kn === "detalhes" ||
          kn === "докладно" ||
          kn === "відомості" ||
          kn === "інформація" ||
          kf === "ayrintilar"
        )
          detailCol++;
      }
      return timeCol > 0 && typeCol > 0 && detailCol > 0;
    }

    const pathOk = (/** @type {string} */ p) => {
      const s = String(p || "");
      const hit =
        /Windows Error Reporting|Problem Reports|Reliability|WER|Report\s*Archive|Fault\s*Bucket|Windows\s+Hata\s+Raporları|Windows\s+Hata\s+Raporlaması|Windows\s+Hata\s+Raporlama|Windows\s+Hata\s+Bildirimleri|Windows\s+Sorun\s+Bildirimleri|Sorun\s+Bildirimleri|Hata\s+raporları|Hata\s+raporlaması|Hata\s+raporlama|Hata\s+bildirimleri|\bHata\s+Raporlama\b|Yazılım\s+Ortamı\s*\/\s*Hata|Yazilim\s+Ortami\s*\/\s*Hata|Rapports?\s+d['\u2019]?erreurs\s+Windows|Rapports?\s+de\s+probl/i.test(
          s
        ) ||
        /Windows\s+felrapportering|Felrapportering|fel\s+rapportering|Programmiljö.*fel|Programmiljo.*fel|problemrapport/i.test(
          s
        ) ||
        /Windows\s*エラー報告|エラー\s*報告|ソフトウェア環境.*エラー|エラー\s*コンテナ/i.test(s) ||
        /Отчеты об ошибках|Отчёт об ошибках|отчетов об ошибках|Сообщения об ошибках|сообщения об ошибках|Повідомлення\s+про\s+помилки|Звітування\s+про\s+критичні\s+помилки|звітів\s+про\s+помилки|Журнал ошибок Windows|архив отчетов|архив отчётов|надежност|діагностичн|діагност|діагностич|діагностичн|діагностики/i.test(
          s
        ) ||
        /Rapportering av feil|Feilrapportering|Fejlrapportering|Fejlrapport|Problemrapporter|Rapports de problèmes|Rapporti di problemi|Segnalazione problemi|Informes de problemas|Informes de errores de Windows|Informe de errores de Windows|Relatórios de problemas|Relatórios de erros|Relatório de erros|Relatório de Erros|Informa[cç][oõ]es\s+sobre\s+(?:os\s+)?problemas|Ambiente de software.*Relató|Ambiente de Software.*Relató|Probleemrapporten|Foutrapportage|Windows-foutrapportage|Zgłaszanie błędów|Raportowanie błędów|Vianmääritys|Virheraportointi|Fejlfindingsrapport|Problémabehandler|Hibajelentések|Raportare erori|Windows hibajelentések|Windows-fouten|Raporty o błędach|Relatórios de erros do Windows|Windows-felrapportering|Rapportering av Windows|Windows-probleemrapporten|تقارير المشكلات|تقارير الأخطاء|问题报告|問題報告|問題のレポート|Windows 오류 보고|Αναφορές σφαλμάτων|Aruanded|Windowsi veateated/i.test(
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

    /** Path title match or WER-shaped Item/Value stream under this path (covers uncommon Turkish path spellings). */
    const pathOkOrContent = (/** @type {string} */ p) => {
      const s = String(p || "");
      if (
        /Group\s*Policy|Registry\s*key|групповых\s*политик|раздел\s*реестра|グループ\s*ポリシー|レジストリ\s*キー|レジストリのキー/i.test(
          s
        )
      )
        return false;
      if (pathOk(p)) return true;
      return pathLooksLikeWerFromKvs(kvs.filter((k) => k.path === p));
    };

    /** One MSInfo {@code <Data>} row with child elements Saat / Tür / Ayrıntılar (path title may not match {@code pathOk}). */
    const rowFieldsLookLikeWerTable = (/** @type {Record<string, string>} */ fields) => {
      if (!fields || typeof fields !== "object") return false;
      let timeCol = 0;
      let typeCol = 0;
      let detailCol = 0;
      for (const k of Object.keys(fields)) {
        const kn = msinfoFieldKeyNormLower(k);
        const kf = networkFieldKeyAsciiFold(k);
        if (
          kn === "tid" ||
          kn === "saat" ||
          kn === "time" ||
          kn === "hora" ||
          kn === "час" ||
          kn === "durée" ||
          kn === "duree" ||
          kn === "data e hora" ||
          kn === "data e hora do evento" ||
          (kn.includes("data") && kn.includes("hora") && kn.length < 48)
        )
          timeCol++;
        if (
          kn === "typ" ||
          kn === "tür" ||
          kn === "type" ||
          kn === "tipo" ||
          kn === "тип" ||
          kn === "nome do evento" ||
          kn === "tipo de evento"
        )
          typeCol++;
        if (
          kn === "information" ||
          kn === "informações" ||
          kn === "informacoes" ||
          kn === "ayrıntılar" ||
          kn === "details" ||
          kn === "détails" ||
          kn === "detalles" ||
          kn === "detalhes" ||
          kf === "ayrintilar"
        )
          detailCol++;
      }
      return timeCol > 0 && typeCol > 0 && detailCol > 0;
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
      if (!pathOkOrContent(r.path) && !rowFieldsLookLikeWerTable(r.fields)) continue;
      const ent = werEntryFromRowFields(r.fields, r.path);
      if (ent) pushDeduped(ent);
    }

    const pathsFromKvs = [...new Set(kvs.map((k) => k.path))].filter(pathOkOrContent);
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
      /System Summary|Systemübersicht|Résumé du système|Résumé\s+système|Resumo do sistema|Resumen del sistema|Informações do sistema|Informazioni di sistema|Informace o systému|Podsumowanie systemu|Přehled systému|Systemoversigt|Systeemoverzicht|Systemöversikt|Systemoversikt|Järjestelmäyhteenveto|Süsteemi kokkuvõte|Zusammenfassung|Rendszerösszefoglaló|Rezumat sistem|Sistem özeti|Відомості\s+про\s+систему|ملخص النظام|系统摘要|系統摘要|システムの要約|システムの概要|システム概要|시스템 요약|Επισκόπηση συστήματος|Σύνοψη συστήματος|Сводка о системе|Сведения о системе|Сводка системы|Сведения системы|Информация о системе|Обзор системы|Системные сведения|Основные сведения|Общие сведения/i,
    softwareEnvPath:
      /Software Environment|Softwareumgebung|Software-omgeving|Softwareomgeving|Environnement logiciel|Entorno de software|Ambiente de software|Ambiente software|Програмне\s+середовище|Служби|Системні\s+драйвери|Автоматично\s+завантажувані\s+програми|Programvarumiljö|Programmiljö|Softwaremiljø|Softwarové prostředí|Środowisko programowe|Szoftverkörnyezet|Yazılım ortamı|Yazılım\s+Ortamı|Yazilim\s+Ortami|Tarkvara keskkond|Mediu software|Ohjelmistoympäristö|Περιβάλλον λογισμικού|بيئة البرامج|软件环境|軟體環境|ソフトウェア環境|ソフトウェア\s*環境|スタートアップ\s*プログラム|スタートアッププログラム|サービス|実行中のサービス|起動しているサービ스|소프트웨어 환경|Программная среда|Программное обеспечение|Сведения о программном обеспечении|Среда программ|Элементы автозагрузки|Программы в автозагрузке|Программы автозагрузки|Программ автозагрузки|Автозагрузка программ|Автозагрузка/iu,
    memoryRowPath:
      /System Summary|Systemübersicht|Résumé du système|Résumé\s+système|Resumen del sistema|Resumo do sistema|Відомості\s+про\s+систему|Memory|\bMinne\b|Maskinvaruresurser|Arbeitsspeicher|Mémoire|Memoria|Memória|Virtual Memory|Virtueller Arbeitsspeicher|Mémoire virtuelle|Memoria virtual|Memória virtual|Virtueel geheugen|Virtuellt minne|Virtuel hukommelse|Virtuaalinen muisti|Virtuaalimuisti|Wirtualna pamięć|Sanal bellek|Memorie virtuală|Virtuaalmälu|virtuální paměť|虚拟内存|虛擬記憶體|仮想メモリ|メモリの要約|メモリ\s*リソース|가상 메모리|Виртуальная память|Память|Оперативная память|Физическая память|Сводка о системе|Сведения о системе|Сводка системы|Сведения системы|Информация о системе|Обзор системы|Системные сведения|系统摘要|系統摘要|Järjestelmäyhteenveto|Podsumowanie systemu|Přehled systému|Systeemoverzicht|Systemoversigt|Systemöversikt|Systemoversikt|Süsteemi kokkuvõte|Informazioni di sistema|Sistem özeti|ملخص النظام|システムの要約|システムの概要|시스템 요약|Σύνοψη συστήματος|Επισκόπηση συστήματος|Pagineringssökväg|Auslagerungsdatei|分页文件|Sayfalama|sayfalama|Växlingsfil/i,
    /** @param {RegExp | RegExp[]} labelRe */
    itemPatterns(labelRe) {
      return Array.isArray(labelRe) ? labelRe : [labelRe];
    },
  };

  /**
   * Turkish “Software Environment” paths vary in Unicode (İ/ı/I/i); {@link MSINFO_I18N.softwareEnvPath} can miss some exports.
   * @param {string} p
   */
  function msinfoPathLooksLikeSoftwareEnvironment(p) {
    const s = String(p || "")
      .normalize("NFC")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (MSINFO_I18N.softwareEnvPath.test(s)) return true;
    if (/Програмне\s+середовище/i.test(s)) return true;
    if (/Yazilim\s+Ortami|Yaz\u0131l\u0131m\s+Ortam\u0131/i.test(s)) return true;
    if (/\bYaz(ilim|ılım)\s+Ortam(i|ı|I|İ)\b/i.test(s)) return true;
    return false;
  }

  /**
   * True when an MSInfo category path is the localized “system summary” table (or parent chain contains it).
   * Some locales use wording not covered by {@link MSINFO_I18N.summaryPath} alone.
   * @param {string} p
   */
  function msinfoSummaryPathMatches(p) {
    const s = String(p || "")
      .normalize("NFC")
      .replace(/\s+/g, " ")
      .trim();
    if (MSINFO_I18N.summaryPath.test(s)) return true;
    return /Сводка о системе|Сведения о системе|Сводка системы|Сведения системы|Системные сведения|Основные сведения|Общие сведения|Відомості\s+про\s+систему|システムの要約|Résumé\s+système|\bSysteminformation\b|Maskinvaruresurser|\bDator\s*\/\s*Systemöversikt/i.test(
      s
    );
  }

  /**
   * MSInfo row labels sometimes include a trailing colon or NBSP; normalized before regex tests.
   * @param {string | null | undefined} s
   */
  function normalizeMsinfoItemLabel(s) {
    return String(s ?? "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .replace(/:\s*$/, "")
      .trim();
  }

  /**
   * MSInfo XML often uses {@code <Objekt>label</Objekt>} and {@code <Värde>value</Värde>}; the display label is in the element text, not the tag name.
   * @param {Record<string, string> | null | undefined} f
   * @returns {{ lab: string, val: string }}
   */
  function rowLabelValueFromMsInfoFields(f) {
    if (!f || typeof f !== "object") return { lab: "", val: "" };
    const lab =
      f.Objekt ??
      f.objekt ??
      f.Item ??
      f.item ??
      f.Element ??
      f.element ??
      f["Елемент"] ??
      f["елемент"] ??
      f["Элемент"] ??
      "";
    const val =
      f.Värde ??
      f.värde ??
      f.Value ??
      f.value ??
      f.Valor ??
      f["Значення"] ??
      f["значення"] ??
      f["Значение"] ??
      "";
    return { lab: String(lab || "").trim(), val: String(val || "").trim() };
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
        kvs.find((k) =>
          msinfoSummaryPathMatches(k.path) && labelPat.test(normalizeMsinfoItemLabel(k.item))
        )?.value || ""
      ).trim();
      if (v) return v;
      v = (
        kvs.find((k) => kvPathOk(k.path) && labelPat.test(normalizeMsinfoItemLabel(k.item)))?.value || ""
      ).trim();
      if (v) return v;
      for (const r of rows) {
        if (!kvPathOk(r.path)) continue;
        const { lab, val } = rowLabelValueFromMsInfoFields(r.fields);
        if (lab && val && labelPat.test(normalizeMsinfoItemLabel(lab))) return val;
        for (const [k, val2] of Object.entries(r.fields)) {
          if (labelPat.test(normalizeMsinfoItemLabel(k)) && String(val2).trim()) return String(val2).trim();
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
    const cand = kvs.filter(
      (k) =>
        msinfoSummaryPathMatches(k.path) &&
        (/^Тип$/i.test((k.item || "").trim()) ||
          /^Tür$/u.test((k.item || "").trim()) ||
          /^Tipo$/iu.test((k.item || "").trim()) ||
          /^Type$/i.test((k.item || "").trim()) ||
          /^Typ$/i.test((k.item || "").trim()))
    );
    if (!cand.length) return "";
    const vOf = (/** @type {{ value?: string }} */ k) => String(k.value || "").trim();
    /** WER / event vocabulary can appear under a misleading short “Typ” row in mixed exports. */
    const looksLikeInvalidSystemTypeValue = (t) =>
      /^application\s+error$/i.test(String(t || "").trim()) ||
      /^application\s+hang$/i.test(String(t || "").trim()) ||
      /\bWindows\s+Error\s+Reporting\b/i.test(String(t || "")) ||
      /\bfault\s+bucket\b/i.test(String(t || ""));
    const looksLikePcKind = (t) =>
      /компьютер|на базе|x64|x86|it-based|à\s+base|processeur|архитектур|рабоч|робоч|настільн|мобильн|ноутбук|планшет|встраиваем|встроенн|masaüstü|dizüstü|taşınabilir|bilgisayar|temelli|baserad|arbetsstation|skrivbords|stationär|stationar|desktop|laptop|tablet|workstation|\bpc\b|based\s+pc/i.test(
        t
      );
    const looksLikeDriverKind = (t) =>
      /драйвер|driver|kernel|ядер|ядра|ядро|kbd|filter|устройств|controller|sürücü|çekirdek/i.test(t);
    const scoreTypValue = (/** @type {string} */ t) => {
      if (looksLikeInvalidSystemTypeValue(t)) return -5;
      if (looksLikePcKind(t)) return 2;
      if (looksLikeDriverKind(t)) return 0;
      return 1;
    };
    const best = [...cand].sort((a, b) => scoreTypValue(vOf(b)) - scoreTypValue(vOf(a)))[0];
    const pick = vOf(best);
    if (looksLikeInvalidSystemTypeValue(pick)) return "";
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
        if (
          !/^Тип$/i.test(k.trim()) &&
          !/^Tür$/u.test(k.trim()) &&
          !/^Tipo$/iu.test(k.trim()) &&
          !/^Type$/i.test(k.trim()) &&
          !/^Typ$/i.test(k.trim())
        )
          continue;
        const t = String(v || "").trim();
        if (t) vals.push(t);
      }
    }
    if (!vals.length) return "";
    const looksLikeInvalidSystemTypeValue = (t) =>
      /^application\s+error$/i.test(String(t || "").trim()) ||
      /^application\s+hang$/i.test(String(t || "").trim()) ||
      /\bWindows\s+Error\s+Reporting\b/i.test(String(t || ""));
    const looksLikePcKind = (t) =>
      /компьютер|на базе|x64|x86|it-based|à\s+base|processeur|архитектур|рабоч|робоч|настільн|мобильн|ноутбук|планшет|встраиваем|встроенн|masaüstü|dizüstü|taşınabilir|bilgisayar|temelli|baserad|arbetsstation|skrivbords|stationär|stationar|desktop|laptop|tablet|workstation|\bpc\b|based\s+pc/i.test(
        t
      );
    const looksLikeDriverKind = (t) =>
      /драйвер|driver|kernel|ядер|ядра|ядро|kbd|filter|устройств|controller|sürücü|çekirdek/i.test(t);
    const scoreTypValue = (/** @type {string} */ t) => {
      if (looksLikeInvalidSystemTypeValue(t)) return -5;
      if (looksLikePcKind(t)) return 2;
      if (looksLikeDriverKind(t)) return 0;
      return 1;
    };
    const pick =
      [...vals].sort((a, b) => scoreTypValue(b) - scoreTypValue(a))[0] || vals[0];
    if (looksLikeInvalidSystemTypeValue(pick)) return "";
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
   * Like {@link kvValI18n} but only rows whose path is the localized System Summary (avoids WER / software tables that reuse “System Type” labels).
   * @param {RegExp | RegExp[]} itemRes
   * @param {{ path: string, item: string, value: string }[]} kvs
   */
  function kvValSummaryI18n(itemRes, kvs) {
    for (const re of MSINFO_I18N.itemPatterns(itemRes)) {
      const x = kvs.find((k) => msinfoSummaryPathMatches(k.path) && re.test((k.item || "").trim()));
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
      /^Processorn$/iu,
      /^Processeur$/i,
      /^Prozessor$/i,
      /^Procesador$/i,
      /^Processador$/i,
      /^Процессор$/i,
      /^Процесор$/u,
      /^处理器$/,
      /^プロセッサ$/,
      /^プロセッサー$/,
      /^İşlemci$/u,
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
      if (/^(Processor|Процессор|Процесор)$/i.test(it)) score += 5;
      if (/^İşlemci$/u.test(it)) score += 5;
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

    const boardPathRe =
      /Motherboard|Base\s*Board|BaseBoard|System Board|Mainboard|Main Board|Anakart|Temel\s*Kart|Moderkort|Baskort|Basplatta/i;
    const boardItemPrefixRe = /^(BaseBoard|Base\s*Board|Temel\s+Kart|Anakart|Moderkort|Baskort|Basplatta)\b/i;
    /** pt-BR/es/de/uk: “Fabricante da BaseBoard” / “Produto BaseBoard” / “Виробник системної плати” live under System Summary without a {@code BaseBoard …} item prefix — include them for {@link pickBoard}. */
    const summaryBaseBoardItemRe =
      /^(Fabricante\s+da\s+BaseBoard|Produto\s+BaseBoard|Vers[aã]o\s+da\s+BaseBoard|Fabricante\s+da\s+placa\s+m[aã]e|Produto\s+da\s+placa\s+m[aã]e|Fabricante\s+de\s+la\s+placa\s+base|Producto\s+de\s+placa\s+base|Versi[oó]n\s+de\s+la\s+placa\s+base|Fabricant\s+de\s+la\s+carte\s+de\s+base|Produit\s+de\s+la\s+carte\s+de\s+base|Version\s+de\s+la\s+carte\s+de\s+base|Num[eé]ro\s+de\s+s[eé]rie\s+de\s+la\s+carte\s+de\s+base|Moderkortstillverkare|Moderkortsprodukt|Moderkortsversion|Moderkortsmodell|Tillverkare\s+för\s+moderkort|Produkt\s+för\s+moderkort|Version\s+för\s+moderkort|Baskortstillverkare|Baskortsprodukt|Baskortets\s+tillverkare|Baskortets\s+produkt|Baskortets\s+version|Виробник\s+системної\s+плати|Тип\s+системної\s+плати|Версія\s+системної\s+плати|Модель\s+системної\s+плати)$/iu;
    /** Normalize WMI-style {@code Fabricante_da_BaseBoard} tags and odd spacing so labels match {@link pickBoardML} entries. */
    const normBoardItem = (/** @type {string} */ s) =>
      String(s ?? "")
        .trim()
        .replace(/_/g, " ")
        .replace(/\s+/g, " ")
        .normalize("NFC");
    let boardKvs = kvs.filter((k) => boardPathRe.test(k.path));
    if (!boardKvs.length) {
      boardKvs = kvs.filter((k) =>
        /^(BaseBoard|Base Board|Moderkort|Baskort|Basplatta)\s+/i.test((k.item || "").trim())
      );
    }
    /** Turkish (and some locales) list “Temel Kart …” under System Summary, not a separate board path. */
    const summaryBoardKvs = kvs.filter(
      (k) => msinfoSummaryPathMatches(k.path) && boardItemPrefixRe.test((k.item || "").trim())
    );
    if (summaryBoardKvs.length) {
      const seen = new Set(boardKvs.map((k) => `${k.path}\u0001${k.item}`));
      for (const k of summaryBoardKvs) {
        const key = `${k.path}\u0001${k.item}`;
        if (seen.has(key)) continue;
        seen.add(key);
        boardKvs.push(k);
      }
    }
    const summaryBaseBoardKvs = kvs.filter(
      (k) => msinfoSummaryPathMatches(k.path) && summaryBaseBoardItemRe.test(normBoardItem(k.item))
    );
    if (summaryBaseBoardKvs.length) {
      const seen = new Set(boardKvs.map((k) => `${k.path}\u0001${normBoardItem(k.item)}`));
      for (const k of summaryBaseBoardKvs) {
        const key = `${k.path}\u0001${normBoardItem(k.item)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        boardKvs.push(k);
      }
    }
    const pickBoard = (label) => {
      const lab = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(
        `^(BaseBoard|Base\\s*Board|Temel\\s*Kart|Anakart|Moderkort|Baskort|Basplatta)\\s+${lab}$|^${lab}$`,
        "iu"
      );
      const x = boardKvs.find((k) => re.test(normBoardItem(k.item)));
      return x?.value || "";
    };
    const pickBoardFromRows = (label) => {
      const lab = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(
        `^(BaseBoard|Base\\s*Board|Temel\\s*Kart|Anakart|Moderkort|Baskort|Basplatta)\\s+${lab}$|^${lab}$`,
        "iu"
      );
      for (const r of rows) {
        if (!boardPathRe.test(r.path) && !msinfoSummaryPathMatches(r.path)) continue;
        for (const [k, v] of Object.entries(r.fields)) {
          if (re.test(normBoardItem(k)) && v && String(v).trim()) return String(v).trim();
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
    /** System Summary item (not necessarily “Temel Kart …”); used when board OEM was misread as Microsoft. */
    const pickSummaryValueByItemRe = (/** @type {RegExp} */ itemRe) => {
      for (const k of kvs) {
        if (!msinfoSummaryPathMatches(k.path)) continue;
        const it = normBoardItem(k.item);
        if (itemRe.test(it) && String(k.value || "").trim()) return String(k.value).trim();
      }
      for (const r of rows) {
        if (!msinfoSummaryPathMatches(r.path)) continue;
        for (const [kk, v] of Object.entries(r.fields)) {
          if (itemRe.test(normBoardItem(kk)) && String(v || "").trim()) return String(v).trim();
        }
      }
      return "";
    };
    let motherboard = {
      manufacturer: pickBoardML([
        "Temel Kart Üreticisi",
        "Temel kart üreticisi",
        "Temel Kart Ureticisi",
        "Anakart Üreticisi",
        "Anakart üreticisi",
        "Fabricante de la placa base",
        "Fabricante da BaseBoard",
        "Fabricante_da_BaseBoard",
        "Fabricant de la carte de base",
        "BaseBoard Manufacturer",
        "Base Board Manufacturer",
        "Manufacturer",
        "Hersteller",
        "Fabricant",
        "Fabricante",
        "Производитель",
        /** Ukrainian (uk-UA) — {@code Виробник системної плати}. */
        "Виробник системної плати",
        "Виробник",
        "制造商",
        "Üretici",
        "Tillverkare för basplatta",
        "Basplattans tillverkare",
        "Moderkortstillverkare",
        "Tillverkare för moderkort",
        "Moderkorts tillverkare",
        "Baskortstillverkare",
        "Baskortets tillverkare",
      ]),
      product: pickBoardML([
        "Temel Kart Ürünü",
        "Temel kart ürünü",
        "Temel Kart Urunu",
        "Temel Kart Modeli",
        "Temel kart modeli",
        "Anakart Ürünü",
        "Anakart ürünü",
        "Anakart Modeli",
        "Anakart modeli",
        "Produto BaseBoard",
        "Produto_BaseBoard",
        "Producto de placa base",
        "Produit de la carte de base",
        "BaseBoard Product",
        "Base Board Product",
        "BaseBoard Model",
        "Product",
        "Model",
        "Product Name",
        "Produkt",
        "Modell",
        "Modèle",
        "Modelo",
        "Nombre de producto",
        "Продукт",
        /** Ukrainian (uk-UA) — {@code Тип системної плати}. */
        "Тип системної плати",
        "Модель системної плати",
        "型号",
        "Ürün",
        "Produkt för basplatta",
        "Basplattans produkt",
        "Moderkortsprodukt",
        "Moderkortsmodell",
        "Moderkorts produkt",
        "Produkt för moderkort",
        "Baskortsprodukt",
        "Baskortets produkt",
      ]),
      version: pickBoardML([
        "Temel Kart Sürümü",
        "Temel kart sürümü",
        "Temel Kart Surumu",
        "Versão da BaseBoard",
        "Versao da BaseBoard",
        "Versión de la placa base",
        "Version de la carte de base",
        "Numéro de série de la carte de base",
        "Numero de serie de la carte de base",
        "BaseBoard Version",
        "Version",
        "Serial Number",
        "Seriennummer",
        "Numéro de série",
        "Número de serie",
        "Версия",
        /** Ukrainian (uk-UA) — {@code Версія системної плати}. */
        "Версія системної плати",
        "Версія",
        "版本",
        "Seri Numarası",
        "Version för basplatta",
        "Basplattans version",
        "Moderkortsversion",
        "Version för moderkort",
        "Baskortets version",
        "Moderkorts revision",
      ]),
    };
    {
      const mfrBb = pickSummaryValueByItemRe(/^Fabricante\s+da\s+BaseBoard$/i);
      const prodBb = pickSummaryValueByItemRe(/^Produto\s+BaseBoard$/i);
      if (mfrBb) motherboard.manufacturer = mfrBb;
      if (prodBb) motherboard.product = prodBb;
      const shortBoardSku = (/** @type {string} */ p) => {
        const t = String(p || "").trim();
        return t && /^[0-9A-Z]{3,6}$/i.test(t) && !/\s/.test(t);
      };
      const sysModel =
        pickSummaryValueByItemRe(/^Modelo\s+do\s+sistema$/i) ||
        pickSummaryValueByItemRe(/^Modelo\s+del\s+sistema$/i);
      if (sysModel && String(sysModel).trim()) {
        const prod = (motherboard.product || "").trim();
        if (!prod || shortBoardSku(prod)) motherboard.product = String(sysModel).trim();
      }
      const sysMfr =
        pickSummaryValueByItemRe(/^Fabricante\s+del\s+sistema$/i) ||
        pickSummaryValueByItemRe(/^Fabricante\s+del\s+SO$/i);
      if (sysMfr && String(sysMfr).trim() && !/^microsoft\b/i.test(String(sysMfr).trim())) {
        const mf = (motherboard.manufacturer || "").trim();
        if (!mf || /^microsoft\b/i.test(mf)) motherboard.manufacturer = String(sysMfr).trim();
      }
    }
    if (!motherboard.manufacturer && !motherboard.product) {
      const anyBoard = (/** @param {RegExp} itemRe */ itemRe) =>
        kvs.find((k) => itemRe.test(normBoardItem(k.item)));
      const m =
        anyBoard(/^Fabricante\s+da\s+BaseBoard$/i) ||
        anyBoard(/^BaseBoard Manufacturer$/i) ||
        anyBoard(/^Mainboardhersteller$/i) ||
        anyBoard(/^Temel Kart Üreticisi$/iu) ||
        anyBoard(/^Temel kart üreticisi$/iu) ||
        anyBoard(/^Moderkortstillverkare$/iu) ||
        anyBoard(/^Baskortstillverkare$/iu);
      const p =
        anyBoard(/^Produto\s+BaseBoard$/i) ||
        anyBoard(/^BaseBoard Product$/i) ||
        anyBoard(/^BaseBoard Model$/i) ||
        anyBoard(/^Base Board Product$/i) ||
        anyBoard(/^Mainboardprodukt$/i) ||
        anyBoard(/^Mainboardmodell$/i) ||
        anyBoard(/^Temel Kart Ürünü$/iu) ||
        anyBoard(/^Temel kart ürünü$/iu) ||
        anyBoard(/^Temel Kart Modeli$/iu) ||
        anyBoard(/^Moderkortsprodukt$/iu) ||
        anyBoard(/^Moderkortsmodell$/iu) ||
        anyBoard(/^Baskortsprodukt$/iu);
      const v =
        anyBoard(/^BaseBoard Version$/i) ||
        anyBoard(/^BaseBoard Serial Number$/i) ||
        anyBoard(/^Base Board Serial Number$/i) ||
        anyBoard(/^Mainboardversion$/i) ||
        anyBoard(/^Mainboardseriennummer$/i) ||
        anyBoard(/^Temel Kart Sürümü$/iu) ||
        anyBoard(/^Temel kart sürümü$/iu) ||
        anyBoard(/^Moderkortsversion$/iu);
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
          f["Fabricante de la placa base"] ||
          f["Fabricante da BaseBoard"] ||
          f["Fabricante_da_BaseBoard"] ||
          f["Temel Kart Üreticisi"] ||
          f["Temel kart üreticisi"] ||
          f["Anakart Üreticisi"] ||
          f["Anakart üreticisi"] ||
          f["BaseBoard Manufacturer"] ||
          f["Base Board Manufacturer"] ||
          f["Изготовитель основной платы"] ||
          f["Moderkortstillverkare"] ||
          f["Tillverkare för moderkort"] ||
          f["Baskortstillverkare"] ||
          f["Baskortets tillverkare"] ||
          f.Hersteller;
        const prod =
          f["Producto de placa base"] ||
          f["Produto BaseBoard"] ||
          f["Produto_BaseBoard"] ||
          f["Temel Kart Ürünü"] ||
          f["Temel kart ürünü"] ||
          f["Temel Kart Modeli"] ||
          f["Anakart Ürünü"] ||
          f["Anakart ürünü"] ||
          f["Anakart Modeli"] ||
          f["BaseBoard Product"] ||
          f["Base Board Product"] ||
          f["BaseBoard Model"] ||
          f["Модель основной платы"] ||
          f["Moderkortsprodukt"] ||
          f["Moderkortsmodell"] ||
          f["Baskortsprodukt"] ||
          f["Baskortets produkt"] ||
          f.Produkt ||
          f.Modell ||
          f.Modèle;
        const ver =
          f["Versión de la placa base"] ||
          f["BaseBoard Version"] ||
          f["BaseBoard Serial Number"] ||
          f["Версия основной платы"] ||
          f["Temel Kart Sürümü"] ||
          f["Temel kart sürümü"] ||
          f["Moderkortsversion"] ||
          f["Baskortets version"] ||
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
        const x = kvs.find(
          (k) => msinfoSummaryPathMatches(k.path) && itemRe.test(normBoardItem(k.item))
        );
        return (x?.value || "").trim();
      };
      const mfr =
        pickSmKv(/^Fabricante\s+da\s+BaseBoard$/i) ||
        pickSmKv(/^Изготовитель основной платы$/i) ||
        pickSmKv(/^Temel Kart Üreticisi$/iu) ||
        pickSmKv(/^Temel kart üreticisi$/iu) ||
        pickSmKv(/^Moderkortstillverkare$/iu) ||
        pickSmKv(/^Tillverkare\s+för\s+moderkort$/iu) ||
        pickSmKv(/^Baskortstillverkare$/iu);
      const prod =
        pickSmKv(/^Produto\s+BaseBoard$/i) ||
        pickSmKv(/^Модель основной платы$/i) ||
        pickSmKv(/^Temel Kart Ürünü$/iu) ||
        pickSmKv(/^Temel kart ürünü$/iu) ||
        pickSmKv(/^Temel Kart Modeli$/iu) ||
        pickSmKv(/^Moderkortsprodukt$/iu) ||
        pickSmKv(/^Moderkortsmodell$/iu) ||
        pickSmKv(/^Baskortsprodukt$/iu);
      const ver =
        pickSmKv(/^Версия основной платы$/i) ||
        pickSmKv(/^Temel Kart Sürümü$/iu) ||
        pickSmKv(/^Temel kart sürümü$/iu) ||
        pickSmKv(/^Moderkortsversion$/iu);
      if (mfr || prod || ver) {
        motherboard = {
          manufacturer: mfr || motherboard.manufacturer,
          product: prod || motherboard.product,
          version: ver || motherboard.version,
        };
      }
    }

    /** Generic “Manufacturer” / BIOS rows sometimes read as Microsoft; retail board model + Turkish system fields fix it. */
    {
      const m = (motherboard.manufacturer || "").trim();
      const p = (motherboard.product || "").trim();
      const blob = `${p} ${motherboard.version || ""}`;
      if (
        /^microsoft\b/i.test(m) &&
        /\b(aorus|gigabyte|asus|asrock|msi|tuf|rog|prime|b550|x570|z690|b650|x670|wrx80|tr\d\d|maximus|crosshair|tomahawk|unify|carbon|phantom|taichi|fatal|diamond|hawk|aero|master|elite|proart|strix)\b/i.test(
          blob
        )
      ) {
        const cands = [
          pickSummaryValueByItemRe(/^Fabricante\s+da\s+BaseBoard$/i),
          pickBoardML([
            "Temel Kart Üreticisi",
            "Temel kart üreticisi",
            "Temel Kart Ureticisi",
            "Anakart Üreticisi",
            "Anakart üreticisi",
            "BaseBoard Manufacturer",
            "Base Board Manufacturer",
          ]),
          pickSummaryValueByItemRe(/^Sistem Üreticisi$/iu),
          pickSummaryValueByItemRe(/^Sistem üreticisi$/iu),
          pickSummaryValueByItemRe(/^System Manufacturer$/i) ||
          pickSummaryValueByItemRe(/^Fabricante del sistema$/i) ||
          pickSummaryValueByItemRe(/^Fabricante del SO$/i),
        ];
        for (const c of cands) {
          const t = String(c || "").trim();
          if (t && !/^microsoft\b/i.test(t)) {
            motherboard.manufacturer = t;
            break;
          }
        }
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
    pushItem(/^Rol de la plataforma$/i);
    pushItem(/^Rol de plataforma$/i);
    pushItem(/^Función de la plataforma$/i);
    pushItem(/^Tipo de sistema$/i);
    pushItem(/^Tipo do sistema$/i);
    pushItem(/^Função da plataforma$/i);
    pushItem(/^Função da Plataforma$/i);
    pushItem(/^Platform Rolü$/u);
    pushItem(/^Роль платформы$/i);
    pushItem(/^Роль платформи$/u);
    pushItem(/^Systemrolle$/i);
    pushItem(/^System SKU$/i);
    pushItem(/^Тип системы$/i);
    pushItem(/^Systemtyp$/i);
    pushItem(/^Sistem Ailesi$/u);
    pushItem(/^Kasa Türü$/u);
    pushItem(/^Bilgisayar Sistemi Türü$/u);
    for (const r of rows) {
      const f = r.fields;
      const blob = [
        f.Type,
        f["Тип"],
        f.Chassis,
        f["Тип корпуса"],
        f["Enclosure Type"],
        f["System Type"],
        f["Rol de la plataforma"],
        f["Rol de plataforma"],
        f["Función de la plataforma"],
        f["Tipo de sistema"],
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
          /^Operativsystemets namn$/iu,
          /^Betriebssystemname$/i,
          /^Nom du système d[\u2019']exploitation$/i,
          /^Nombre del sistema operativo$/i,
          /** Spanish MSInfo “SO” abbreviation for the OS name row. */
          /^Nombre del SO$/i,
          /^Nome do SO$/i,
          /^Nome do sistema operacional$/i,
          /^Nome do Sistema Operacional$/i,
          /^Nom du système$/i,
          /^Название ОС$/i,
          /^Имя ОС$/i,
          /** Ukrainian (uk-UA) — {@code Назва ОС}. */
          /^Назва\s+ОС$/iu,
          /^Назва\s+операційної\s+системи$/iu,
          /^Ім'я\s+ОС$/iu,
          /^操作系统名称$/i,
          /^OS\s*名$/,
          /^OS名$/,
          /^İşletim Sistemi Adı$/u,
        ],
        kvs
      ) ||
      kvValI18n(
        [
          /^OS Name$/i,
          /^Betriebssystemname$/i,
          /^Имя ОС$/i,
          /^Название ОС$/i,
          /^Назва\s+ОС$/iu,
          /^OS\s*名$/,
          /^OS名$/,
          /^Nombre del SO$/i,
          /^İşletim Sistemi Adı$/u,
        ],
        kvs
      ) ||
      fieldFromRowsI18n(
        [
          /^OS Name$/i,
          /^Operativsystemets namn$/iu,
          /^Betriebssystemname$/i,
          /^Nom du système d[\u2019']exploitation$/i,
          /^Nombre del sistema operativo$/i,
          /^Nombre del SO$/i,
          /^Название ОС$/i,
          /^Имя ОС$/i,
          /^Назва\s+ОС$/iu,
          /^OS\s*名$/,
          /^OS名$/,
          /^İşletim Sistemi Adı$/u,
        ],
        rows
      );
    let osVersionLine =
      kvFromSummaryI18n(
        [
          /^Version$/i,
          /** Swedish row next to OS name under Systemöversikt. */
          /^Operativsystemversion$/iu,
          /^Windows-version$/iu,
          /** Spanish single-column “Version” row (often includes build text). */
          /^Versión$/i,
          /^Versão$/i,
          /** Ukrainian (uk-UA) — {@code Версія}. */
          /^Версія$/iu,
          /^Версія\s+ОС$/iu,
          /^Betriebssystemversion$/i,
          /^Version du système$/i,
          /^Version du système d[\u2019']exploitation$/i,
          /^Versión del sistema operativo$/i,
          /^Versão do sistema operacional$/i,
          /^Версия ОС$/i,
          /^Версия$/i,
          /^バージョン$/,
          /^OS\s*バージョン$/,
          /^İşletim Sistemi Sürümü$/u,
          /^Sürüm$/u,
        ],
        kvs
      ) ||
      kvValI18n(
        [
          /^OS Version$/i,
          /^Betriebssystemversion$/i,
          /^Version du système$/i,
          /^Version du système d[\u2019']exploitation$/i,
          /^Версия$/i,
          /^Версия ОС$/i,
          /^Версія$/iu,
          /^バージョン$/,
          /^OS\s*バージョン$/,
          /^Versión$/i,
          /^Versão$/i,
          /^İşletim Sistemi Sürümü$/u,
          /^Sürüm$/u,
        ],
        kvs
      ) ||
      fieldFromRowsI18n(
        [
          /^OS Version$/i,
          /^Betriebssystemversion$/i,
          /^Version du système$/i,
          /^Version du système d[\u2019']exploitation$/i,
          /^Версия$/i,
          /^Версия ОС$/i,
          /^Версія$/iu,
          /^バージョン$/,
          /^OS\s*バージョン$/,
          /^Versión$/i,
          /^Versão$/i,
          /^İşletim Sistemi Sürümü$/u,
          /^Sürüm$/u,
        ],
        rows
      );
    if (!osVersionLine) {
      const verKv = kvs.find((k) => {
        const it = (k.item || "").trim();
        const versionish =
          /^Version$/i.test(it) ||
          /^Version du système$/i.test(it) ||
          /^Version du système d[\u2019']exploitation$/i.test(it) ||
          /^Betriebssystemversion$/i.test(it) ||
          /^OS Version$/i.test(it) ||
          /^Versión$/i.test(it) ||
          /^Versão$/i.test(it) ||
          /^Versão do sistema operacional$/i.test(it) ||
          /^İşletim Sistemi Sürümü$/u.test(it) ||
          /^Sürüm$/u.test(it) ||
          /^Версія$/iu.test(it);
        return (
          versionish &&
          /\b(10|11)\.0\.\d+|Microsoft Windows|Майкрософт Windows|Windows \d+|\bСборка\s*\d+|\bЗбірка\s*\d+|\bDerleme\s*\d+|\bCompilação\s*\d+/i.test(
            k.value || ""
          )
        );
      });
      osVersionLine = (verKv?.value || "").trim();
    }
    if (!osVersionLine) {
      osVersionLine =
        kvValI18n([/^Version$/i, /^Betriebssystemversion$/i, /^Версия$/i, /^Версія$/iu, /^Versão$/i, /^Sürüm$/u], kvs) ||
        fieldFromRowsI18n(
          [/^Version$/i, /^Betriebssystemversion$/i, /^Версия$/i, /^Версія$/iu, /^Versão$/i, /^Sürüm$/u],
          rows
        );
    }
    let osBuild = extractWindowsBuildFromVersionLine(osVersionLine);
    if (!osBuild) {
      const buildLine =
        kvFromSummaryI18n(
          [
            /^İşletim Sistemi Derlemesi$/u,
            /^OS Derlemesi$/u,
            /^Derleme$/u,
            /^Windows Derlemesi$/u,
            /^Versionsnummer för Windows$/iu,
            /^Windows-version$/iu,
            /^Compilación del SO$/i,
            /^Compilación de Windows$/i,
            /^Compilación$/i,
            /^Compilação do SO$/i,
            /^Compilação de Windows$/i,
            /^Compilação$/i,
          ],
          kvs
        ) ||
        kvValI18n(
          [
            /^Derleme$/u,
            /^İşletim Sistemi Derlemesi$/u,
            /^Versionsnummer för Windows$/iu,
            /^Compilación del SO$/i,
            /^Compilación de Windows$/i,
            /^Compilação do SO$/i,
            /^Compilação de Windows$/i,
          ],
          kvs
        );
      osBuild = extractWindowsBuildFromVersionLine(buildLine) || "";
      if (!osBuild && /^\d{4,6}$/.test(String(buildLine || "").trim())) osBuild = String(buildLine).trim();
    }

    const systemTypeRaw =
      kvFromSummaryI18n(
        [
          /^System Type$/i,
          /^Systemtyp$/i,
          /^System\s+typ$/iu,
          /** Swedish MSInfo / WMI (“Computer type” row). */
          /^Datortyp$/iu,
          /^Typ av dator$/iu,
          /^Systemets typ$/iu,
          /^Dators typ$/iu,
          /** fr-FR MSInfo often uses the bare “Type” label in the system summary table. */
          /^Type$/i,
          /^Type du système$/i,
          /^Tipo de sistema$/i,
          /^Tipo de Sistema$/i,
          /^Tipo do sistema$/i,
          /^Тип системы$/i,
          /^Тип компьютера$/i,
          /^Тип ПК$/i,
          /^Вид системы$/i,
          /^系统类型$/i,
          /^システムの種類$/,
          /^システム\s*タイプ$/,
          /^Sistem Türü$/u,
        ],
        kvs
      ) ||
      pickSystemTypeFromBareTypKvs(kvs) ||
      kvValSummaryI18n(
        [
          /^System Type$/i,
          /^Systemtyp$/i,
          /^System\s+typ$/iu,
          /^Datortyp$/iu,
          /^Typ av dator$/iu,
          /^Systemets typ$/iu,
          /^Dators typ$/iu,
          /^Type$/i,
          /^Tipo de sistema$/i,
          /^Tipo do sistema$/i,
          /^Тип системы$/i,
          /^Тип компьютера$/i,
          /^Тип ПК$/i,
          /^Вид системы$/i,
          /^Sistem Türü$/u,
        ],
        kvs
      ) ||
      fieldFromRowsSummaryPathOnly(
        [
          /^System Type$/i,
          /^Systemtyp$/i,
          /^System\s+typ$/iu,
          /^Datortyp$/iu,
          /^Typ av dator$/iu,
          /^Systemets typ$/iu,
          /^Dators typ$/iu,
          /^Type$/i,
          /^Type du système$/i,
          /^Tipo de sistema$/i,
          /^Tipo do sistema$/i,
          /^Тип системы$/i,
          /^Тип компьютера$/i,
          /^Тип ПК$/i,
          /^Вид системы$/i,
          /^系统类型$/i,
          /^Sistem Türü$/u,
        ],
        rows
      ) ||
      pickSystemTypeFromBareTypRows(rows);
    const processor =
      pickProcessorSummaryFromKvs(kvs) ||
      kvFromSummaryI18n(
        [
          /^Processor$/i,
          /^Processorn$/iu,
          /^Processeur$/i,
          /^Prozessor$/i,
          /^Procesador$/i,
          /^Processador$/i,
          /^Процессор$/i,
          /^Процесор$/u,
          /^处理器$/i,
          /^プロセッサ$/,
          /^プロセッサー$/,
          /^İşlemci$/u,
        ],
        kvs
      ) ||
      fieldFromRowsSummaryPathOnly(
        [
          /^Processor$/i,
          /^Processorn$/iu,
          /^Processeur$/i,
          /^Prozessor$/i,
          /^Процессор$/i,
          /^Процесор$/u,
          /^プロセッサ$/,
          /^プロセッサー$/,
          /^İşlemci$/u,
        ],
        rows
      ) ||
      fieldFromRowsI18n(
        [
          /^Processor$/i,
          /^Processorn$/iu,
          /^Processeur$/i,
          /^Prozessor$/i,
          /^Процессор$/i,
          /^Процесор$/u,
          /^プロセッサ$/,
          /^プロセッサー$/,
          /^İşlemci$/u,
        ],
        rows
      );
    const timeZone =
      kvFromSummaryI18n(
        [
          /^Time Zone$/i,
          /^Tidszon$/iu,
          /^Zeitzone$/i,
          /^Fuseau horaire$/i,
          /** Some fr-FR builds use the plural “Fuseaux horaires” for the same row. */
          /^Fuseaux horaires$/i,
          /^Zona horaria$/i,
          /^Fuso horário$/i,
          /^Часовой пояс$/i,
          /^Часовий пояс$/u,
          /^时区$/i,
          /^タイム\s*ゾーン$/,
          /^タイムゾーン$/,
          /^時刻帯$/,
          /^Saat Dilimi$/u,
        ],
        kvs
      ) ||
      kvValI18n(
        [
          /^Time Zone$/i,
          /^Tidszon$/iu,
          /^Zeitzone$/i,
          /^Fuseau horaire$/i,
          /^Fuseaux horaires$/i,
          /^Zona horaria$/i,
          /^Fuso horário$/i,
          /^Часовой пояс$/i,
          /^Часовий пояс$/u,
          /^タイム\s*ゾーン$/,
          /^タイムゾーン$/,
          /^時刻帯$/,
          /^Saat Dilimi$/u,
        ],
        kvs
      ) ||
      fieldFromRowsSummaryPathOnly(
        [
          /^Time Zone$/i,
          /^Tidszon$/iu,
          /^Zeitzone$/i,
          /^Fuseau horaire$/i,
          /^Fuseaux horaires$/i,
          /^Zona horaria$/i,
          /^Fuso horário$/i,
          /^Часовой пояс$/i,
          /^Часовий пояс$/u,
          /^タイム\s*ゾーン$/,
          /^タイムゾーン$/,
          /^時刻帯$/,
          /^Saat Dilimi$/u,
        ],
        rows
      ) ||
      fieldFromRowsI18n(
        [
          /^Time Zone$/i,
          /^Tidszon$/iu,
          /^Zeitzone$/i,
          /^Fuseau horaire$/i,
          /^Fuseaux horaires$/i,
          /^Zona horaria$/i,
          /^Fuso horário$/i,
          /^Часовой пояс$/i,
          /^Часовий пояс$/u,
          /^タイム\s*ゾーン$/,
          /^タイムゾーン$/,
          /^時刻帯$/,
          /^Saat Dilimi$/u,
        ],
        rows
      );
    const osInstallDate =
      kvFromSummaryI18n(
        [
          /Original Install Date/i,
          /Install Date/i,
          /Ursprungligt installationsdatum/i,
          /Ursprüngliches Installationsdatum/i,
          /^Installationsdatum$/i,
          /Date d[\u2019']installation d[\u2019']origine/i,
          /Date d[\u2019']installation originale/i,
          /Fecha de instalación original/i,
          /Data de instalação original/i,
          /Data da instalação original/i,
          /Дата установки/i,
          /原始安装日期/i,
          /Orijinal Kurulum Tarihi/u,
          /Kurulum Tarihi/u,
          /^İlk Kurulum Tarihi$/u,
        ],
        kvs
      ) ||
      kvValI18n(
        [
          /Original Install Date/i,
          /^Install Date$/i,
          /Ursprungligt installationsdatum/i,
          /Ursprüngliches Installationsdatum/i,
          /^Installationsdatum$/i,
          /Date d[\u2019']installation/i,
          /Orijinal Kurulum Tarihi/u,
          /Orijinal kurulum tarihi/u,
          /^İlk Kurulum Tarihi$/u,
          /^Ilk Kurulum Tarihi$/u,
          /Kurulum Tarihi/u,
          /^Kurulum tarihi$/u,
        ],
        kvs
      ) ||
      fieldFromRowsI18n(
        [
          /Original Install Date/i,
          /Ursprungligt installationsdatum/i,
          /Ursprüngliches Installationsdatum/i,
          /Date d[\u2019']installation d[\u2019']origine/i,
          /Fecha de instalación original/i,
          /Orijinal Kurulum Tarihi/u,
          /Orijinal kurulum tarihi/u,
          /^İlk Kurulum Tarihi$/u,
          /^Ilk Kurulum Tarihi$/u,
          /Kurulum Tarihi/u,
        ],
        rows
      ) ||
      fieldFromRowsSummaryPathOnly(
        [
          /Original Install Date/i,
          /Install Date/i,
          /Fecha de instalación original/i,
          /Orijinal Kurulum Tarihi/u,
          /Orijinal kurulum tarihi/u,
          /^İlk Kurulum Tarihi$/u,
          /^Ilk Kurulum Tarihi$/u,
          /Kurulum Tarihi/u,
        ],
        rows
      ) ||
      (() => {
        const lab =
          /orijinal\s+kurulum\s+tarihi|ilk\s+kurulum\s+tarihi|kurulum\s+tarihi|original\s+install|fecha\s+de\s+instalación\s+original|date\s+d[\u2019']installation/i;
        for (const k of kvs) {
          if (!msinfoSummaryPathMatches(k.path)) continue;
          const it = (k.item || "").trim();
          if (lab.test(it) && String(k.value || "").trim()) return String(k.value).trim();
        }
        for (const r of rows) {
          if (!msinfoSummaryPathMatches(r.path)) continue;
          for (const [kk, v] of Object.entries(r.fields)) {
            if (lab.test(kk.trim()) && String(v || "").trim()) return String(v).trim();
          }
        }
        return "";
      })();

    let platformRole =
      kvFromSummaryI18n(
        [
          /^Platform Role$/i,
          /^Plattformsroll$/iu,
          /^Systemrolle$/i,
          /^Plattformrolle$/i,
          /^Rôle de la plateforme$/i,
          /^Rol de la plataforma$/i,
          /^Rol de plataforma$/i,
          /^Función de la plataforma$/i,
          /^Función de plataforma$/i,
          /^Função da plataforma$/i,
          /^Função da Plataforma$/i,
          /^Роль платформы$/i,
          /^Роль платформи$/u,
          /^プラットフォームの役割$/,
          /^プラットフォーム\s*ロール$/,
          /^Platform Rolü$/u,
        ],
        kvs
      ) ||
      kvValI18n(
        [
          /^Platform Role$/i,
          /^Plattformsroll$/iu,
          /^Systemrolle$/i,
          /^Plattformrolle$/i,
          /^Rôle de la plateforme$/i,
          /^Rol de la plataforma$/i,
          /^Rol de plataforma$/i,
          /^Función de la plataforma$/i,
          /^Función de plataforma$/i,
          /^Função da plataforma$/i,
          /^Função da Plataforma$/i,
          /^Роль платформы$/i,
          /^Роль платформи$/u,
          /^プラットフォームの役割$/,
          /^プラットフォーム\s*ロール$/,
          /^Platform Rolü$/u,
        ],
        kvs
      ) ||
      fieldFromRowsSummaryPathOnly(
        [
          /^Platform Role$/i,
          /^Plattformsroll$/iu,
          /^Systemrolle$/i,
          /^Rôle de la plateforme$/i,
          /^Rol de la plataforma$/i,
          /^Rol de plataforma$/i,
          /^Función de la plataforma$/i,
          /^Función de plataforma$/i,
          /^Função da plataforma$/i,
          /^Função da Plataforma$/i,
          /^Роль платформы$/i,
          /^Роль платформи$/u,
          /^プラットフォームの役割$/,
          /^プラットフォーム\s*ロール$/,
          /^Platform Rolü$/u,
        ],
        rows
      ) ||
      fieldFromRowsI18n(
        [
          /^Platform Role$/i,
          /^Plattformsroll$/iu,
          /^Systemrolle$/i,
          /^Rôle de la plateforme$/i,
          /^Rol de la plataforma$/i,
          /^Rol de plataforma$/i,
          /^Función de la plataforma$/i,
          /^Función de plataforma$/i,
          /^Função da plataforma$/i,
          /^Função da Plataforma$/i,
          /^Роль платформы$/i,
          /^Роль платформи$/u,
          /^プラットフォームの役割$/,
          /^プラットフォーム\s*ロール$/,
          /^Platform Rolü$/u,
        ],
        rows
      );
    if (!String(platformRole || "").trim()) {
      const roleItemRe = /^Rol(\s+de(\s+la)?)?\s+plataforma$/i;
      const fnItemRe = /^Funci[oó]n(\s+de(\s+la)?)?\s+plataforma$/i;
      const fnPtItemRe = /^Fun[cç][aã]o(\s+da)?\s+plataforma$/i;
      for (const k of kvs) {
        if (!msinfoSummaryPathMatches(k.path)) continue;
        const it = (k.item || "").trim();
        if (!roleItemRe.test(it) && !fnItemRe.test(it) && !fnPtItemRe.test(it)) continue;
        const v = String(k.value || "").trim();
        if (v) {
          platformRole = v;
          break;
        }
      }
      if (!String(platformRole || "").trim()) {
        outerPlat: for (const r of rows) {
          if (!msinfoSummaryPathMatches(r.path)) continue;
          for (const [kk, v] of Object.entries(r.fields)) {
            const kt = kk.trim();
            if (!roleItemRe.test(kt) && !fnItemRe.test(kt) && !fnPtItemRe.test(kt)) continue;
            if (String(v || "").trim()) {
              platformRole = String(v).trim();
              break outerPlat;
            }
          }
        }
      }
    }
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
    /** Turkish (and similar) platform strings — JS \\b does not treat these letters as "word" chars. */
    const prNorm = String(platformRole || "").toLocaleLowerCase("tr-TR");
    const pr = prNorm;
    if (
      (/\bdesktop\b|workstation|appliance\s+pc|рабочий\s+стол|робочий\s+стіл|настольн|рабочая\s+станция|masaüstü|masaustu|escritorio|sobremesa|equipo\s+de\s+escritorio|área\s+de\s+trabalho|area\s+de\s+trabalho|stationär\s+dator|stationar\s+dator|skrivbordsdator|poste\s+de\s+travail/i.test(
        pr
      ) ||
        /^bureau$/i.test(String(platformRole || "").trim())) &&
      !/\bmobile\b|\bmobil\b|\bslate\b|мобильн|планшет|ноутбук|dizüstü|dizustu|taşınabilir|tasinabilir|móvil|movil|portátil|portatil|tableta|computador\s+móvel|computador\s+movel|surfplatta/i.test(
        pr
      )
    ) {
      systemForm = "Desktop / workstation-class";
    } else if (
      /\bmobile\b|\bmobil\b|slate|handheld|phone|мобильн|планшет|ноутбук|переносн|dizüstü|dizustu|taşınabilir|tasinabilir|móvil|movil|portátil|portatil|tableta|equipo\s+móvil|equipo\s+movil|bärbar\s+dator|surfplatta/i.test(
        pr
      )
    ) {
      systemForm = "Laptop / mobile-class";
    } else if (
      pcSystemType &&
      /\bdesktop\b|рабочий\s+стол|робочий\s+стіл|настольн|masaüstü|masaustu/i.test(
        String(pcSystemType).toLocaleLowerCase("tr-TR")
      ) &&
      !/\bmobile\b|\bmobil\b|laptop|ноутбук|планшет|dizüstü|dizustu|taşınabilir|tasinabilir/i.test(
        String(pcSystemType).toLocaleLowerCase("tr-TR")
      )
    ) {
      systemForm = "Desktop / workstation-class";
    } else if (
      pcSystemType &&
      /\bmobile\b|\bmobil\b|laptop|notebook|tablet|ноутбук|планшет|переносн|dizüstü|dizustu|taşınabilir|tasinabilir/i.test(
        String(pcSystemType).toLocaleLowerCase("tr-TR")
      )
    ) {
      systemForm = "Laptop / mobile-class";
    } else if (
      systemTypeRaw &&
      /portátil|portatil|móvil|movil|tablet|tableta|2\s*en\s*1|convertible|dizüstü|dizustu|notebook|laptop|computador\s+móvel|computador\s+movel/i.test(
        String(systemTypeRaw).toLocaleLowerCase("tr-TR")
      )
    ) {
      systemForm = "Laptop / mobile-class";
    } else if (
      systemTypeRaw &&
      /escritorio|sobremesa|estación\s+de\s+trabajo|workstation|tower|todo\s+en\s+uno|todo-en-uno|equipo\s+de\s+escritorio|pc\s+baseado\s+em\s+x64|pc\s+baseado\s+em\s+x86|computador\s+baseado\s+em\s+x64|área\s+de\s+trabalho|area\s+de\s+trabalho|x64-baserad|x86-baserad|arm64-baserad|baserad\s+dator|stationär|skrivbords/i.test(
        String(systemTypeRaw).toLocaleLowerCase("tr-TR")
      )
    ) {
      systemForm = "Desktop / workstation-class";
    } else if (
      chassisType &&
      (/\b(desktop|tower|mini|pizza|low profile|convertible|all in one|mainstream)\b/i.test(chassisType) ||
        /masaüstü|masaustu/i.test(String(chassisType).toLocaleLowerCase("tr-TR")))
    ) {
      if (/all\s*in\s*one|convertible/i.test(chassisType)) {
        systemForm = /convertible/i.test(chassisType)
          ? "Laptop / mobile-class (2-in-1 / convertible chassis)"
          : "All-in-one (desktop with integrated display)";
      } else {
        systemForm = "Desktop / workstation-class";
      }
    } else if (
      chassisType &&
      (/\b(notebook|laptop|portable|handheld|tablet|ноутбук|планшет|переносн)\b/i.test(chassisType) ||
        /dizüstü|dizustu|taşınabilir|tasinabilir/i.test(String(chassisType).toLocaleLowerCase("tr-TR")))
    ) {
      systemForm = "Laptop / mobile-class";
    } else {
      let blob = formHints.join(" ").toLocaleLowerCase("tr-TR");
      blob = blob
        .replace(/\blaptop\s*gpu\b/gi, " ")
        .replace(/\bmobile\s*gpu\b/gi, " ")
        .replace(/\bnotebook\s*gpu\b/gi, " ");
      if (
        /laptop|notebook|portable|convertible|tablet|slate|book(?! drive)|dizüstü|dizustu|taşınabilir|tasinabilir/i.test(
          blob
        )
      ) {
        systemForm = "Laptop / mobile-class";
      } else if (/all-in-one|\baio\b/i.test(blob)) {
        systemForm = "All-in-one (desktop with integrated display)";
      } else if (
        /desktop|tower|mini pc|workstation|small form|sff|docking|docked|masaüstü|masaustu/i.test(blob)
      ) {
        systemForm = "Desktop / workstation-class";
      } else if (blob.trim()) {
        systemForm = `See hints: ${formHints[0]}`;
      } else if (processor && /\b\d{4}HS\b|\b\d{4}HX\b|\b8945HS\b|\b7840HS\b|\bRyzen[^\n]{0,120}Radeon\s+\d{3,4}M\b/i.test(processor)) {
        /** Spanish (and other) exports often omit Platform Role; mobile-class CPU suffixes are a strong hint. */
        systemForm = "Laptop / mobile-class (inferred from CPU model in export)";
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
        /^Versión y fecha de BIOS$/i.test(it) ||
        /^Versión y fecha de la BIOS$/i.test(it) ||
        /^Versão do BIOS \/ data$/i.test(it) ||
        /^Версия BIOS\/дата$/i.test(it) ||
        /^Версия\s+BIOS\s*\/\s*дата$/i.test(it) ||
        /^Версия\s*BIOS$/i.test(it) ||
        /** Ukrainian (uk-UA) — {@code Версія BIOS/Дата}. */
        /^Версія\s*BIOS\s*\/\s*Дата$/iu.test(it) ||
        /^Версія\s*BIOS\/Дата$/iu.test(it) ||
        /^Версія\s*BIOS$/iu.test(it) ||
        /^BIOS版本\/日期$/i.test(it) ||
        /^BIOS\s+Sürümü\s*\/\s*Tarihi$/iu.test(it) ||
        /^BIOS\s+Sürümü\/Tarihi$/iu.test(it) ||
        /^BIOS-version\s*\/\s*datum$/iu.test(it) ||
        /^BIOS-version\/datum$/iu.test(it) ||
        /^BIOS-version\s+och\s+datum$/iu.test(it) ||
        /^BIOS\s+version\s*\/\s*datum$/iu.test(it) ||
        /^BIOS\s+versionsdatum$/iu.test(it) ||
        /^Inbyggd\s+programvara\s*\/\s*datum$/iu.test(it)
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
          !/date|datum|fecha|дата|日期|tarih/i.test((k.item || "").trim())
      );
      const d = kvs.find((k) =>
        /BIOS.*Date|Release Date|BIOS-Datum|Datum du BIOS|fecha del BIOS|Data do BIOS|дата BIOS|BIOS.*Tarih|BIOS.*datum|Releasedatum|Versionsdatum|Releasedatum\s+för\s+BIOS/i.test(
          (k.item || "").trim()
        )
      );
      biosVersion = v?.value || "";
      biosDate = d?.value || "";
      const pathBios = kvs.filter(
        (k) =>
          /\/BIOS$/i.test(k.path) ||
          /Components.*BIOS/i.test(k.path) ||
          /Komponenter.*BIOS/i.test(k.path) ||
          /Компоненты.*BIOS/i.test(k.path) ||
          /Bileşenler.*BIOS/i.test(k.path) ||
          /Inbyggd\s+programvara|SMBIOS|Firmware|\/BIOS\s/i.test(k.path)
      );
      if (!biosVersion) {
        const ver = pathBios.find(
          (k) =>
            /^Version$/i.test(k.item) ||
            /^Версия$/i.test((k.item || "").trim()) ||
            /^Sürüm$/iu.test((k.item || "").trim()) ||
            /^BIOS-version$/iu.test((k.item || "").trim()) ||
            /^BIOS\s+version$/iu.test((k.item || "").trim())
        );
        if (ver) biosVersion = ver.value;
      }
      if (!biosDate) {
        const rd = pathBios.find((k) =>
          /Date|Дата|Tarih|Datum|Releasedatum|Versionsdatum|Releasedatum\s+för/i.test(k.item || "")
        );
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
              "Drivrutinsversion",
              "Версия драйвера",
              "Sürücü Sürümü",
              "Sürücü Versiyonu",
              "ドライバーのバージョン",
              "ドライバのバージョン",
              "ドライバー バージョン",
              "ドライバ バージョン",
            ]),
            driverDate: displayDriverDateMs(nvFields),
            pnp: displayFieldByLabels(nvFields, [
              "PNP Device ID",
              "PNP_Device_ID",
              "ID PNP-устройства",
              "ИД PNP-устройства",
              "PNP デバイス ID",
              "PNPデバイス ID",
              "Plug and Play デバイス ID",
              "Tak ve Çalıştır Aygıt Kimliği",
              "Tak ve Çalıştır aygıt kimliği",
            ]),
            adapterType: displayFieldByLabels(nvFields, [
              "Adapter Type",
              "Adaptortyp",
              "Typ av adapter",
              "Adaptertyp",
              "Тип адаптера",
              "Описание адаптера",
              "Bağdaştırıcı Türü",
              "アダプターの種類",
              "アダプター種類",
              "アダプタの種類",
              "アダプター タイプ",
              "製品の種類",
              "チップの種類",
              "チップ タイプ",
            ]),
            adapterRam: displayAdapterRamMs(nvFields),
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
      /Problem Devices|Problemtreiber|Probleemapparaten|Dispositivos con problemas|Dispositivos\s+problem[aá]ticos|Dispositivos com problemas|Dispositivos\s+com\s+falhas|Dispositivos\s+defeituosos|Пристрої\s+з\s+неполадками|Проблемные устройства|Устройства с проблемами|Устройства с неполадками|Устройства с ошибками|Неисправные устройства|appareils problématiques|appareils avec des problèmes|dispositivi con problemi|probleem apparaten|problemhardware|设备有问题|問題のあるデバイス|不具合のあるデバイス|故障したデバイス|問題デバイス|問題のデバイス|Sorunlu\s+Aygıtlar|Sorunlu\s+aygıtlar|Sorunlu\s+Cihazlar|Sorunlu\s+cihazlar/i;
    const pathLooksLikeProblemDevices = (/** @type {string} */ p) => {
      const s = String(p || "");
      if (problemPathRe.test(s)) return true;
      if (/неполадк/i.test(s) && /устройств/i.test(s) && /\s[сС]\s/i.test(s)) return true;
      if (/問題|不具合|故障/.test(s) && /デバイス|装置/.test(s)) return true;
      return false;
    };
    /** Normalize MSInfo row/item labels (spaces, underscores, NBSP, BOM) for column matching. */
    const problemFieldKeyCompact = (/** @type {string} */ s) => {
      const t = String(s || "")
        .replace(/^\ufeff/, "")
        .replace(/\u00a0/g, " ")
        .trim()
        .replace(/[\s_.-]+/g, "");
      try {
        return t.toLocaleLowerCase("tr-TR");
      } catch {
        return t.toLowerCase();
      }
    };
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
        f.Nome ||
        f.Nombre ||
        f.Item ||
        f.Description ||
        f.Gerät ||
        f.Dispositivo ||
        f.Устройство ||
        /** Ukrainian (uk-UA) MSInfo Problem Devices row tag — XML element {@code <Пристрій>}. */
        f["Пристрій"] ||
        f["Пристрiй"] ||
        f.デバイス ||
        f["デバイス名"] ||
        rowValueByCompactKeys(f, [
          "device",
          "name",
          "nombre",
          "item",
          "description",
          "устройство",
          "пристрій",
          "пристрiй",
          "название",
          "nome",
          "デバイス名",
          "デバイス",
          "aygıt",
          "cihaz",
        ]) ||
        "";
      const vendor =
        f["PNP Device ID"] ||
        f["PNP_Device_ID"] ||
        f["Код_устройства_PNP"] ||
        f["Код устройства PNP"] ||
        /** Ukrainian XML element {@code <Код_пристрою_PNP>}. */
        f["Код_пристрою_PNP"] ||
        f["Код пристрою PNP"] ||
        f["PNP デバイス ID"] ||
        f["PNPデバイス ID"] ||
        f["Tak ve Çalıştır Aygıt Kimliği"] ||
        f["Tak ve Çalıştır aygıt kimliği"] ||
        rowValueByCompactKeys(f, [
          "pnpdeviceid",
          "кодустройстваpnp",
          "кодпристроюpnp",
          "pnpデバイスid",
          "plugandplayデバイスid",
          "takveçalıştıraygıtkimliği",
        ]) ||
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
        /** Ukrainian XML element {@code <Код_помилки>}. */
        f["Код_помилки"] ||
        f["Код помилки"] ||
        f["問題"] ||
        f["問題のコード"] ||
        f["問題コード"] ||
        f["エラー コード"] ||
        rowValueByCompactKeys(f, [
          "problem",
          "problemcode",
          "кодошибки",
          "кодпомилки",
          "error",
          "status",
          "fehler",
          "問題",
          "問題のコード",
          "問題コード",
          "エラーコード",
          "sorunkodu",
          "hatakodu",
          "sorun",
        ]) ||
        f.Error ||
        f.Status ||
        f["Code de problème"] ||
        f["Código de problema"] ||
        f["Código de error"] ||
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
          c === "nombre" ||
          c === "nome" ||
          c === "item" ||
          c === "gerät" ||
          c === "dispositivo" ||
          c === "dispositif" ||
          c === "apparaat" ||
          c === "устройство" ||
          c === "пристрій" ||
          c === "пристрiй" ||
          c === "название" ||
          c === "デバイス名" ||
          c === "デバイス" ||
          c === "aygıt" ||
          c === "cihaz"
        );
      };
      const isPnpItem = (/** @type {string} */ it) => {
        const raw = String(it || "").trim();
        const c = problemFieldKeyCompact(it);
        return (
          c === "pnpdeviceid" ||
          c === "pnp_device_id" ||
          c === "кодустройстваpnp" ||
          c === "кодпристроюpnp" ||
          c === "pnpデバイスid" ||
          c === "plugandplayデバイスid" ||
          c === "takveçalıştıraygıtkimliği" ||
          /identificador.*pnp|id\.\s*de\s*dispositivo\s*pnp|dispositivo\s*plug/i.test(raw)
        );
      };
      const isErrorDetailItem = (/** @type {string} */ it) => {
        const raw = String(it || "").trim();
        const c = problemFieldKeyCompact(it);
        return (
          c === "problem" ||
          c === "problemcode" ||
          c === "codigodeerror" ||
          c === "кодошибки" ||
          c === "кодпомилки" ||
          c === "error" ||
          c === "status" ||
          c === "fehler" ||
          /^кодошиб/.test(c) ||
          /^кодпомил/.test(c) ||
          c === "問題" ||
          c === "問題のコード" ||
          c === "問題コード" ||
          c === "エラーコード" ||
          /^問題/.test(c) ||
          /^エラー/.test(c) ||
          c === "sorunkodu" ||
          c === "hatakodu" ||
          c === "sorun" ||
          /^sorun/.test(c) ||
          /c[oó]digo\s+de\s+error/i.test(raw) ||
          /c[oó]digo\s+de\s+erro/i.test(raw)
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
    const allNetworkAdapters = extractAllNetworkAdaptersFallback(kvs, rows);

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

    /** “5,00 GB” style paging-file size — must not be shown as page file location. */
    const looksLikePageFileSizeAmount = (/** @type {string} */ raw) => {
      const s = String(raw || "").trim().toLowerCase();
      if (!s) return false;
      if (/^\d[\d.,\s]*(bytes|kb|mb|gb|tb|байт|гб|тб|мб|кб)\b/i.test(s)) return true;
      return /\d+,\d+\s*(gb|mb|tb|гб|тб|мб)\b/i.test(s);
    };

    const pickPageFileLocation = () => {
      let v =
        pickSummaryMemory([
          /Page File Location\(s\)?/i,
          /Paging File Location/i,
          /Paging Files?:\s*Location/i,
          /Auslagerungsdateiort/i,
          /Speicherort der Auslagerungsdatei/i,
          /Emplacement du fichier d[\u2019']échange/i,
          /Ubicación del archivo de paginación/i,
          /Localização do arquivo de paginação/i,
          /Расположение файла подкачки/i,
          /Файл подкачки/i,
          /分页文件位置/i,
          /ページ\s*ファイルの場所/i,
          /ページング\s*ファイルの場所/i,
          /ページ\s*ファイル\s*の\s*場所/i,
          /Sayfalama\s+Dosyası(?:\s+Konumları?|\s+Konumu)/iu,
          /Plats för växlingsfil/i,
          /Pagineringssökväg/i,
          /Sökväg för växlingsfil/i,
          /Розташування\s+файл(?:ів|у)?\s+довантаження/i,
          /Розташування\s+файла\s+підкачки/i,
        ]) || "";
      if (v && looksLikePageFileSizeAmount(v) && !looksLikePageFilePath(v)) v = "";
      if (v && (!looksLikePageFileSizeAmount(v) || looksLikePageFilePath(v))) return v;
      for (const k of kvs) {
        const it = normalizeMsinfoItemLabel(k.item);
        if (
          /page file location|auslagerungsdateiort|speicherort der auslagerungsdatei|emplacement du fichier|ubicación del archivo|localização do arquivo|расположение файла подкачки|^файл подкачки$|розташування\s+файл.*довантажен|розташування\s+файла\s+підкачки|^файл\s+довантажен|^файл\s+підкачки|分页文件位置|ページ\s*ファイル.*場所|ページング\s*ファイル.*場所|sayfalama\s+dosyası.*konum|plats\s+för\s+växlingsfil|sökväg\s+för\s+växlingsfil|pagineringssökväg/i.test(
            it
          ) &&
          !/växlingsfilsstorlek|storlek\s+för\s+växlingsfil|storlek\s+på\s+växlingsfil/i.test(it) &&
          k.value.trim()
        ) {
          const val = k.value.trim();
          if (looksLikePageFileSizeAmount(val) && !looksLikePageFilePath(val)) continue;
          return val;
        }
      }
      for (const k of kvs) {
        const it = (k.item || "").trim();
        if (
          (/^page file$/i.test(it) ||
            /^auslagerungsdatei$/i.test(it) ||
            /^fichier d[\u2019']échange$/i.test(it) ||
            /^archivo de paginación$/i.test(it) ||
            /^arquivo de paginação$/i.test(it) ||
            /^файл подкачки$/i.test(it) ||
            /^файл\s+довантаження$/iu.test(it) ||
            /^файл\s+підкачки$/iu.test(it) ||
            /^sayfalama\s+dosyası$/iu.test(it) ||
            /^växlingsfil$/iu.test(it) ||
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
          !/(^|\/)Paging(\/|$)|Auslagerung|paginación|paginação|分页|подкачк|довантажен|підкачк|ページ|メモリ|Sayfalama|sayfalama/i.test(
            r.path
          )
        ) {
          continue;
        }
        const objLab = rowLabelValueFromMsInfoFields(r.fields || {});
        const ol = normalizeMsinfoItemLabel(objLab.lab);
        if (
          ol &&
          /page file location|auslagerungsdateiort|speicherort der auslagerungsdatei|emplacement du fichier|ubicación del archivo|localização do arquivo|расположение файла подкачки|^файл подкачки$|розташування\s+файл.*довантажен|розташування\s+файла\s+підкачки|^файл\s+довантажен|^файл\s+підкачки|分页文件位置|ページ\s*ファイル.*場所|ページング\s*ファイル.*場所|sayfalama\s+dosyası.*konum|plats\s+för\s+växlingsfil|sökväg\s+för\s+växlingsfil|pagineringssökväg/i.test(
            ol
          ) &&
          !/växlingsfilsstorlek|storlek\s+för\s+växlingsfil|storlek\s+på\s+växlingsfil/i.test(ol) &&
          String(objLab.val).trim()
        ) {
          const vv = String(objLab.val).trim();
          if (!(looksLikePageFileSizeAmount(vv) && !looksLikePageFilePath(vv))) return vv;
        }
        for (const [key, val] of Object.entries(r.fields)) {
          const kt = key.trim();
          if (
            /page file location|auslagerungsdateiort|speicherort der auslagerungsdatei|emplacement du fichier|ubicación del archivo|расположение файла подкачки|^файл подкачки$|розташування\s+файл.*довантажен|розташування\s+файла\s+підкачки|^файл\s+довантажен|^файл\s+підкачки|分页文件位置|ページ\s*ファイル.*場所|ページング\s*ファイル.*場所|sayfalama\s+dosyası.*konum|plats\s+för\s+växlingsfil|sökväg\s+för\s+växlingsfil|pagineringssökväg/i.test(
              kt
            ) &&
            String(val).trim()
          ) {
            const vv = String(val).trim();
            if (looksLikePageFileSizeAmount(vv) && !looksLikePageFilePath(vv)) continue;
            return vv;
          }
          if (
            (/^page file$/i.test(kt) ||
              /^auslagerungsdatei$/i.test(kt) ||
              /^fichier d[\u2019']échange$/i.test(kt) ||
              /^archivo de paginación$/i.test(kt) ||
              /^файл подкачки$/i.test(kt) ||
              /^файл\s+довантаження$/iu.test(kt) ||
              /^файл\s+підкачки$/iu.test(kt) ||
              /^sayfalama\s+dosyası$/iu.test(kt) ||
              /^växlingsfil$/iu.test(kt) ||
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
        /^Installerat fysiskt minne \(RAM\)$/iu,
        /^Installerat fysiskt minne$/iu,
        /^Installierter physischer Arbeitsspeicher/i,
        /Physischer Arbeitsspeicher.*RAM/i,
        /^Mémoire physique installée/i,
        /** fr-FR: “(RAM)” appears in the label on some Windows builds. */
        /^Mémoire physique \(RAM\) installée$/i,
        /^Memoria física instalada/i,
        /^Memória física instalada/i,
        /^Memória Física.*RAM/i,
        /Установленная оперативная память/i,
        /Установленн[\w\s,.-]*оперативн[\w\s,.-]*памят/i,
        /объём\s+оперативн[\w\s,.-]*памят/i,
        /объем\s+оперативн[\w\s,.-]*памят/i,
        /^已安装的物理内存/i,
        /^インストール済み(?:の)?物理メモリ/i,
        /物理メモリ.*RAM|RAM.*物理メモリ/i,
        /Yüklü\s+Fiziksel\s+Bellek\s*\(\s*RAM\s*\)/iu,
        /^Yüklü\s+Fiziksel\s+Bellek$/iu,
        /^Установлена\s+фізична\s+пам'ять\s*\(\s*ОЗП\s*\)$/iu,
        /^Установлена\s+фізична\s+пам’ять\s*\(\s*ОЗП\s*\)$/u,
        /^Установлена\s+фізична\s+пам'ять$/iu,
        /^Установлена\s+фізична\s+пам’ять$/u,
      ]),
      totalPhysical: pickSummaryMemory([
        /^Total Physical Memory$/i,
        /^Totalt fysiskt minne\b/iu,
        /^Summa fysiskt minne\b/iu,
        /^Gesamter physischer Arbeitsspeicher$/i,
        /^Mémoire physique totale$/i,
        /^Memoria física \(total\)/i,
        /^Memoria física total$/i,
        /^Memória física total$/i,
        /^Всего физической памяти/i,
        /Полный объем физической памяти/i,
        /^物理内存总量$/i,
        /^合計の物理メモリ/i,
        /^合計\s*物理メモリ/i,
        /^物理メモリの合計/i,
        /^Toplam Fiziksel Bellek$/iu,
        /^Загальний\s+обсяг\s+фізичної\s+пам'яті$/iu,
        /^Загальний\s+обсяг\s+фізичної\s+пам’яті$/u,
        /^Усього\s+фізичної\s+пам'яті$/iu,
      ]),
      availablePhysical: pickSummaryMemory([
        /^Available Physical Memory$/i,
        /^Tillgängligt fysiskt minne\b/iu,
        /^Verfügbarer physischer Arbeitsspeicher$/i,
        /^Mémoire physique disponible$/i,
        /^Memoria física disponible$/i,
        /^Memória física disponível$/i,
        /^Доступная физическая память/i,
        /Доступно физической памяти/i,
        /^可用物理内存$/i,
        /^利用可能な物理メモリ/i,
        /^使用可能な物理メモリ/i,
        /^Kullanılabilir Fiziksel Bellek$/iu,
        /^Доступно\s+фізичної\s+пам'яті$/iu,
        /^Доступно\s+фізичної\s+пам’яті$/u,
      ]),
      totalVirtual: pickSummaryMemory([
        /^Total Virtual Memory$/i,
        /^Totalt virtuellt minne\b/iu,
        /^Summa virtuellt minne\b/iu,
        /^Gesamter virtueller Arbeitsspeicher$/i,
        /^Mémoire virtuelle totale$/i,
        /^Memoria virtual \(total\)/i,
        /^Memoria virtual total$/i,
        /^Memória virtual total$/i,
        /^Всего виртуальной памяти/i,
        /^虚拟内存总量$/i,
        /^合計の仮想メモリ/i,
        /^合計\s*仮想メモリ/i,
        /^仮想メモリの合計/i,
        /^Toplam Sanal Bellek$/iu,
        /^Усього\s+віртуальної\s+пам'яті$/iu,
        /^Усього\s+віртуальної\s+пам’яті$/u,
      ]),
      availableVirtual: pickSummaryMemory([
        /^Available Virtual Memory$/i,
        /^Tillgängligt virtuellt minne\b/iu,
        /^Verfügbarer virtueller Arbeitsspeicher$/i,
        /^Mémoire virtuelle disponible$/i,
        /^Memoria virtual disponible$/i,
        /^Memória virtual disponível$/i,
        /^Доступная виртуальная память/i,
        /Доступно виртуальной памяти/i,
        /^可用虚拟内存$/i,
        /^利用可能な仮想メモリ/i,
        /^使用可能な仮想メモリ/i,
        /^Kullanılabilir Sanal Bellek$/iu,
        /^Доступно\s+віртуальної\s+пам'яті$/iu,
        /^Доступно\s+віртуальної\s+пам’яті$/u,
      ]),
      pageFileSpace: pickSummaryMemory([
        /Page File Space/i,
        /Paging File Space/i,
        /Auslagerungsdateigröße/i,
        /Größe der Auslagerungsdatei/i,
        /Espace du fichier d[\u2019']échange/i,
        /Taille (du|maximale du) fichier d[\u2019']échange/i,
        /Espace (actuel|maximum) du fichier d[\u2019']échange/i,
        /Taille du fichier d[\u2019']échange/i,
        /Espacio del archivo de paginación/i,
        /Espaço do arquivo de paginação/i,
        /Размер файла подкачки/i,
        /分页文件空间/i,
        /^ページ\s*ファイルのサイズ/i,
        /^ページング\s*ファイルのサイズ/i,
        /^ページ\s*ファイル\s*空間/i,
        /^Sayfalama\s+Dosyası\s+Alanı$/iu,
        /^Storlek för växlingsfil\b/iu,
        /^Växlingsfilsstorlek\b/iu,
        /^Storlek på växlingsfil\b/iu,
        /^Total storlek för växlingsfil\b/iu,
        /^Розмір\s+файлу\s+довантаження$/iu,
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
      allNetworkAdapters,
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
    if (need > 0 && need <= 10_000) {
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

  /** Element body captured by loose regex — unwrap CDATA like {@link xmlText} does for real DOM nodes. */
  function xmlLooseElementText(raw) {
    let s = String(raw ?? "").trim();
    const cdata = s.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
    if (cdata) s = cdata[1];
    return decodeXmlishText(s.replace(/\s+/g, " ").trim());
  }

  /**
   * Multi-field {@code <Data>} rows (e.g. Time / Type / Details) when Item+Value are absent — DOM-free scan.
   * @param {string} inner
   */
  function looseExtractFieldsFromDataInner(inner) {
    const fields = /** @type {Record<string, string>} */ ({});
    const re = /<([A-Za-z][\w:.-]*)\b[^>]*>([\s\S]*?)<\/\1\s*>/g;
    let m;
    while ((m = re.exec(inner)) !== null) {
      const key = m[1];
      if (!key || Object.prototype.hasOwnProperty.call(fields, key)) continue;
      fields[key] = xmlLooseElementText(m[2] || "");
    }
    return fields;
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
    const imTr = attrBlob.match(/(?:^|[\s,])Öğe\s*=\s*("([^"]*)"|'([^']*)')/iu);
    if (!item.trim() && imTr) item = imTr[2] != null ? imTr[2] : imTr[3] || "";
    const imEs = attrBlob.match(/(?:^|[\s,])Elemento\s*=\s*("([^"]*)"|'([^']*)')/i);
    if (!item.trim() && imEs) item = imEs[2] != null ? imEs[2] : imEs[3] || "";
    const imSv = attrBlob.match(/(?:^|[\s,])Objekt\s*=\s*("([^"]*)"|'([^']*)')/iu);
    if (!item.trim() && imSv) item = imSv[2] != null ? imSv[2] : imSv[3] || "";
    const vm = attrBlob.match(/\bValue\s*=\s*("([^"]*)"|'([^']*)')/i);
    if (vm) value = vm[2] != null ? vm[2] : vm[3] || "";
    const vmRu = attrBlob.match(/(?:^|[\s,])Значение\s*=\s*("([^"]*)"|'([^']*)')/i);
    if (!value.trim() && vmRu) value = vmRu[2] != null ? vmRu[2] : vmRu[3] || "";
    const vmFr = attrBlob.match(/(?:^|[\s,])Valeur\s*=\s*("([^"]*)"|'([^']*)')/i);
    if (!value.trim() && vmFr) value = vmFr[2] != null ? vmFr[2] : vmFr[3] || "";
    const vmJa = attrBlob.match(/(?:^|[\s,])値\s*=\s*("([^"]*)"|'([^']*)')/);
    if (!value.trim() && vmJa) value = vmJa[2] != null ? vmJa[2] : vmJa[3] || "";
    const vmTr = attrBlob.match(/(?:^|[\s,])Değer\s*=\s*("([^"]*)"|'([^']*)')/iu);
    if (!value.trim() && vmTr) value = vmTr[2] != null ? vmTr[2] : vmTr[3] || "";
    const vmEs = attrBlob.match(/(?:^|[\s,])Valor\s*=\s*("([^"]*)"|'([^']*)')/i);
    if (!value.trim() && vmEs) value = vmEs[2] != null ? vmEs[2] : vmEs[3] || "";
    const vmSv = attrBlob.match(/(?:^|[\s,])Värde\s*=\s*("([^"]*)"|'([^']*)')/iu);
    if (!value.trim() && vmSv) value = vmSv[2] != null ? vmSv[2] : vmSv[3] || "";
    return { item: norm(item), value: norm(decodeXmlishText(value)) };
  }

  /** @param {string} inner XML body of a Data element (loose text scan). */
  function looseDataInnerToItemValue(inner) {
    const normInner = (/** @type {string} */ s) => xmlLooseElementText(s);
    const pairs = [
      /** Spanish MSInfo child rows ({@code <Elemento>}/{@code <Valor>}) when XML is repaired as loose text. */
      [/<Elemento\b[^>]*>([\s\S]*?)<\/Elemento>/i, /<Valor\b[^>]*>([\s\S]*?)<\/Valor>/i],
      [/<Item\b[^>]*>([\s\S]*?)<\/Item>/i, /<Value\b[^>]*>([\s\S]*?)<\/Value>/i],
      /** Swedish ({@code <Objekt>}/{@code <Värde>}). */
      [/<Objekt\b[^>]*>([\s\S]*?)<\/Objekt>/iu, /<Värde\b[^>]*>([\s\S]*?)<\/Värde>/iu],
      [/<Элемент\b[^>]*>([\s\S]*?)<\/Элемент>/i, /<Значение\b[^>]*>([\s\S]*?)<\/Значение>/i],
      [/<Élément\b[^>]*>([\s\S]*?)<\/Élément>/i, /<Valeur\b[^>]*>([\s\S]*?)<\/Valeur>/i],
      [/<項目\b[^>]*>([\s\S]*?)<\/項目>/, /<値\b[^>]*>([\s\S]*?)<\/値>/],
      [/<元素\b[^>]*>([\s\S]*?)<\/元素>/, /<值\b[^>]*>([\s\S]*?)<\/值>/],
      [/<항목\b[^>]*>([\s\S]*?)<\/항목>/, /<값\b[^>]*>([\s\S]*?)<\/값>/],
      [/<Eintrag\b[^>]*>([\s\S]*?)<\/Eintrag>/i, /<Wert\b[^>]*>([\s\S]*?)<\/Wert>/i],
      [/<Öğe\b[^>]*>([\s\S]*?)<\/Öğe>/iu, /<Değer\b[^>]*>([\s\S]*?)<\/Değer>/iu],
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
      if (!m) m = rest.match(/^<Category\b[^>]*\b(?:Ad|İsim)\s*=\s*("([^"]*)"|'([^']*)')[^>]*>/iu);
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
        if (item || value) {
          kvs.push({ path: pathStr(), item, value });
        } else {
          const fields = looseExtractFieldsFromDataInner(inner);
          if (Object.keys(fields).length >= 2) {
            rows.push({ path: pathStr(), fields });
          }
        }
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
        ["öğe", "değer"],
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
   * Inspect a non-MSInfo text blob and tell the user what kind of file it actually looks like.
   *
   * The classifier is conservative — we want clear, accurate answers (not guesses), so it returns
   * <code>{ kind: "unknown" }</code> when no high-confidence signal matches. Detection covers every
   * tab supported by the viewer (BSOD/WinDbg, DxDiag, GPU-Z CSV, EVTX) plus common unwanted shapes
   * (email, JSON / HTML / source code, plain prose).
   *
   * @param {string} text decoded file text (UTF-8 / UTF-16 already decoded by the caller)
   * @returns {{
   *   kind:
   *     | "msinfo-plaintext"
   *     | "bsod"
   *     | "dxdiag"
   *     | "gpuz"
   *     | "evtx-fragment"
   *     | "registry"
   *     | "json"
   *     | "html"
   *     | "email"
   *     | "prose"
   *     | "binary"
   *     | "empty"
   *     | "unknown",
   *   summary: string,
   *   suggestedTab: "system" | "bsod" | "gpu" | "evtx" | "dxdiag" | null,
   *   notes: string[]
   * }}
   */
  function classifyNonMsinfoTextContent(text) {
    const sample = String(text || "").trim();
    if (!sample) {
      return {
        kind: "empty",
        summary: "Empty file",
        suggestedTab: null,
        notes: ["The decoded file has no text content."],
      };
    }
    /** Short binary garbage: lots of NULs / replacement chars relative to length. */
    const repl = (sample.match(/\uFFFD/g) || []).length;
    const nulls = (sample.match(/\u0000/g) || []).length;
    if (sample.length < 8 || (repl + nulls) > sample.length * 0.25) {
      return {
        kind: "binary",
        summary: "Binary or wrongly-decoded content",
        suggestedTab: null,
        notes: [
          "The file appears to be binary or saved with a different encoding than the one selected.",
          "Try the Encoding dropdown above (Auto, UTF-16 LE/BE, UTF-8, Windows-1252, Windows-31J) or open the source file with a hex editor to confirm its real format.",
        ],
      };
    }
    /** MSInfo plain-text export uses '[Section]' headers + tab-separated Item / Value rows. */
    if (
      /^\s*\[(System Summary|Hardware Resources|Components|Software Environment|Internet Settings|Office .+|.+System Summary.+)\]/im.test(
        sample
      ) ||
      ((sample.match(/^\s*\[[^\]\n]{2,80}\]\s*$/gm) || []).length >= 2 &&
        (sample.match(/\t/g) || []).length > 6)
    ) {
      return {
        kind: "msinfo-plaintext",
        summary: "MSInfo plain-text / tab export",
        suggestedTab: "system",
        notes: [
          "This looks like an MSInfo plain-text export, not the XML form. The viewer normally accepts both — try toggling the Encoding dropdown (Auto → UTF-16 LE → UTF-8) and reload the file. If that still fails, on the source PC run msinfo32 → File → Save As… → choose Save as type: System Information File (*.nfo) and reload the resulting XML here.",
        ],
      };
    }
    /** BSOD / WinDbg !analyze -v dump. */
    if (
      /BugCheck\s+\w+|STOP:\s*0x[0-9A-F]+|MODULE_NAME:|IMAGE_NAME:|FAILURE_BUCKET_ID:|Probably caused by\s*:|MEMORY_MANAGEMENT|KERNEL_SECURITY_CHECK_FAILURE|DRIVER_IRQL_NOT_LESS_OR_EQUAL|Crash Dump|Bug check\s+0x|!analyze\s+-v/i.test(
        sample
      )
    ) {
      return {
        kind: "bsod",
        summary: "Windows kernel crash text (BSOD / WinDbg !analyze -v)",
        suggestedTab: "bsod",
        notes: [
          "This file looks like a Windows kernel crash dump or WinDbg analysis text, not an MSInfo export.",
          "Open it on the BSOD & WinDbg tab — the parser there extracts BugCheck, modules, drivers, faulting addresses and a recommendations panel from the same content.",
        ],
      };
    }
    /** DxDiag text export. */
    if (
      /^[\s-]*DxDiag\s+(Notes|System Information)|^[\s-]*------?\s*\n.*?(System Information|Display Devices|Sound Devices)/im.test(
        sample
      ) ||
      (/Operating System:/i.test(sample) && /System Manufacturer:/i.test(sample) && /DirectX Version:/i.test(sample))
    ) {
      return {
        kind: "dxdiag",
        summary: "DxDiag text report",
        suggestedTab: "dxdiag",
        notes: [
          "This looks like a DxDiag report (System Information / Display Devices / Sound Devices blocks).",
          "Open it on the DxDiag tab — the viewer there summarises display, system and sound devices from this exact text format.",
        ],
      };
    }
    /** GPU-Z sensor CSV. First line should be a comma-separated header containing key terms. */
    {
      const firstLine = sample.split(/\r?\n/, 1)[0] || "";
      const commaCount = (firstLine.match(/,/g) || []).length;
      if (
        commaCount >= 4 &&
        /\b(Date|GPU\s*Clock|Memory\s*Clock|GPU\s*Temperature|GPU\s*Load|Power|Fan|Hot\s*Spot|VDDC)/i.test(firstLine)
      ) {
        return {
          kind: "gpuz",
          summary: "GPU-Z sensor log (CSV)",
          suggestedTab: "gpu",
          notes: [
            "This looks like a GPU-Z sensor log (timestamped CSV with GPU clock / temperature / load columns).",
            "Open it on the GPU-Z logs tab — that tab graphs every column over time.",
          ],
        };
      }
    }
    /** EVTX text fragment (someone exported events to text). */
    if (
      /Event\[\d+\]:\s*(Log Name|Source|Date|Event ID)/i.test(sample) ||
      /<Event\s+xmlns="http:\/\/schemas\.microsoft\.com\/win\/2004\/08\/events\/event"/i.test(sample)
    ) {
      return {
        kind: "evtx-fragment",
        summary: "Windows Event Log fragment (text export)",
        suggestedTab: "evtx",
        notes: [
          "This looks like a Windows Event Viewer text export, not an MSInfo file.",
          "Open the original .evtx binary on the Event Viewer tab if available — text exports have lower fidelity and many tools cannot reconstruct provider names from them.",
        ],
      };
    }
    /** Windows Registry export. */
    if (/^Windows Registry Editor Version\s+\d/m.test(sample) || /^REGEDIT4\b/m.test(sample)) {
      return {
        kind: "registry",
        summary: "Windows Registry export (.reg)",
        suggestedTab: null,
        notes: [
          "This is a Windows registry export (.reg). The viewer does not parse registry files; open it in regedit.exe or a text editor.",
        ],
      };
    }
    /** JSON document. */
    if (/^[\s\u200B]*[\[{]/.test(sample) && /["{}\[\],:]/.test(sample.slice(-200))) {
      try {
        JSON.parse(sample);
        return {
          kind: "json",
          summary: "JSON document",
          suggestedTab: null,
          notes: [
            "This is a JSON document. The viewer does not interpret arbitrary JSON; open it in a JSON viewer or paste it into a text editor.",
          ],
        };
      } catch {
        /* fall through */
      }
    }
    /** HTML document. */
    if (/<!DOCTYPE\s+html|<html[\s>]|<head[\s>]|<body[\s>]/i.test(sample)) {
      return {
        kind: "html",
        summary: "HTML document",
        suggestedTab: null,
        notes: [
          "This is an HTML page, not an MSInfo export. Open it in a browser, or rename to .html.",
        ],
      };
    }
    /**
     * Email body / forum reply / customer-support message — common when a help-desk ticket attachment
     * is renamed to .nfo by mistake. We look for typical structural cues so we don't false-positive on
     * MSInfo content that happens to contain prose.
     */
    {
      const emailMarkers =
        /^\s*(From|To|Cc|Bcc|Subject|Sent|Date)\s*:|^\s*-----\s*Original\s+Message\s*-----|wrote on .{0,40}:\s*$|^\s*On\s+\w+,\s+\w+\s+\d+,\s+\d{4},\s+at\s+\d/im;
      const farewell =
        /\n\s*(Thanks|Thank you|Regards|Best regards|Sincerely|Cheers|Kind regards|Cordialement|Saludos|Atenciosamente|Mit freundlichen Grüßen|С уважением|З повагою|よろしく)/i;
      const emailLike = /\b[\w.+-]+@[\w-]+\.[\w.-]{2,}\b/.test(sample);
      const phoneLike = /\b\d{7,15}\b/.test(sample);
      const sentenceCount = (sample.match(/[.!?][\s)]/g) || []).length;
      const wordCount = (sample.match(/\b\w{3,}\b/g) || []).length;
      const tabCount = (sample.match(/\t/g) || []).length;
      if (
        tabCount < 4 &&
        sentenceCount >= 2 &&
        wordCount >= 25 &&
        (emailMarkers.test(sample) || farewell.test(sample) || (emailLike && phoneLike))
      ) {
        return {
          kind: "email",
          summary: "Plain text — looks like an email or support reply",
          suggestedTab: null,
          notes: [
            "This file has prose, an email signature and/or contact details — it looks like a customer-support reply or email body, not an MSInfo file.",
            "On the source PC, run msinfo32 → File → Export… (or → Save As… → System Information File *.nfo) and load the new .nfo here.",
          ],
        };
      }
      if (sentenceCount >= 2 && wordCount >= 12 && tabCount < 4) {
        return {
          kind: "prose",
          summary: "Plain text / prose",
          suggestedTab: null,
          notes: [
            "This file is plain prose, not an MSInfo XML export.",
            "If you meant to share a different artefact, open the matching tab. Otherwise, on the source PC run msinfo32 → File → Export… to create a real .nfo and reload it here.",
          ],
        };
      }
    }
    return {
      kind: "unknown",
      summary: "Unknown / unrecognised content",
      suggestedTab: null,
      notes: [
        "The viewer did not recognise this file as MSInfo, BSOD, DxDiag, GPU-Z, EVTX, or any other supported export.",
        "Try the Encoding dropdown (Auto → UTF-16 LE → UTF-8 → Windows-1252) and reload, or open the source file with a hex editor to confirm its real format.",
      ],
    };
  }

  /**
   * @param {string} original raw decoded text
   * @returns {{
   *   doc: Document | null,
   *   data: { kvs: { path: string, item: string, value: string }[], rows: { path: string, fields: Record<string, string> }[] } | null,
   *   mode: "xml" | "repaired" | "loose" | "plaintext" | "none",
   *   notes: string[],
   *   repairedText: string | null,
   *   rawDisplayText: string,
   *   nonMsinfoKind?: string,
   *   nonMsinfoSuggestedTab?: string | null,
   *   nonMsinfoSummary?: string
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

    if (baseline.length >= MSINFO_DOM_SAFE_MAX_CHARS && /<MsInfo\b/i.test(baseline)) {
      const looseLarge = extractMsInfoLooseFromText(baseline);
      const nk = looseLarge.kvs.length;
      const nr = looseLarge.rows.length;
      if (nk >= 5 || nr >= 1) {
        notes.push(
          "Large System Information export: skipped building the full XML DOM so the browser stays responsive and within typical memory limits. A tolerant linear scan reads categories and data rows instead."
        );
        return {
          doc: null,
          data: looseLarge,
          mode: "loose",
          notes,
          repairedText: null,
          rawDisplayText: baseline,
        };
      }
    }

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
      /**
       * Walk every supported tab's signatures and report back a confident classification so the user
       * can either open it on the right tab or accept that the file genuinely has no system info.
       * Pure heuristic, no remote calls; works for all supported MSInfo languages too.
       */
      const classification = classifyNonMsinfoTextContent(sourceDecoded);
      /** @type {string[]} */
      const noneNotes = classification.notes;
      return {
        doc: null,
        data: null,
        mode: "none",
        nonMsinfoKind: classification.kind,
        nonMsinfoSuggestedTab: classification.suggestedTab,
        nonMsinfoSummary: classification.summary,
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
   * @param {{ forceI18nSpan?: boolean }} [i18nOpts] passed to {@link sumI18nSpan} so Translate updates pt-BR GPU strings.
   */
  function renderGpuDashboard(graphics, esc, embedOnly, i18nOpts) {
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

    const cards = units.map((u, i) => renderGpuSubcard(i + 1, u.g, esc, u.legacyNvidiaSlot, i18nOpts));
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
   * @param {{ forceI18nSpan?: boolean }} [i18nOpts]
   */
  function renderGpuSubcard(index, g, esc, legacyNvidiaSlot, i18nOpts) {
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
    const name = sumI18nSpan(String(gg.name || ""), esc, undefined, i18nOpts);
    const pciUrl = gg.pciLookupUrl
      ? String(gg.pciLookupUrl)
      : gg.deviceHuntUrl
        ? String(gg.deviceHuntUrl)
        : "";
    const dv = gg.driverVersionDisplay || gg.driverFormatted || gg.driverFull;
    let driverVersion = sumI18nSpan(String(dv || "—"), esc, undefined, i18nOpts);
    if (isNvidia && gg.driverFormatted && gg.driverFull && String(gg.driverFormatted) !== String(gg.driverFull)) {
      driverVersion += ` <span class="summary-empty">(internal: ${esc(String(gg.driverFull))})</span>`;
    } else if (isIntel && gg.driverFull) {
      driverVersion += ` <span class="summary-empty">(Intel — raw from MSInfo)</span>`;
    }
    const driverDate = sumI18nSpan(String(gg.driverDate || "—"), esc, undefined, i18nOpts);
    const deviceId = sumI18nSpan(String(gg.deviceId || "—"), esc, undefined, i18nOpts);
    const adapterType = sumI18nSpan(String(gg.adapterType || "—"), esc, undefined, i18nOpts);
    const adapterRam = sumI18nSpan(String(gg.adapterRam || "—"), esc, undefined, i18nOpts);

    let resLine = "Not Available";
    if (gg.resolution && String(gg.resolution).trim() && !/^not available|^n\/a$/i.test(String(gg.resolution).trim())) {
      resLine = String(gg.resolution);
    } else if (isNvidia && gg.drivesDisplay === false) {
      resLine =
        "Not listed under NVIDIA in this export (common on hybrid graphics — panel resolution is usually reported on the integrated GPU).";
    }
    const resolution = sumI18nSpan(resLine, esc, undefined, i18nOpts);

    const pciBtn = pciUrl
      ? `<a class="gpu-pci-lookup" href="${esc(pciUrl)}" target="_blank" rel="noopener noreferrer" title="Open PCILookup.com with vendor and device ID filled in"><svg class="gpu-pci-lookup__icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" fill="none"><path d="M18 13v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 3h6v6M10 14 21 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="visually-hidden">PCI lookup (prefilled)</span></a>`
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
   * Turkish Windows strings often use only ASCII + a few letters; still needs Translate (e.g. service display names).
   * @param {string} s
   */
  function looksLikeTurkishWindowsLatinHint(s) {
    const u = String(s || "");
    return (
      /\bhizmeti\b|\bHizmeti\b|\bUygulama\b|\bYönlendirici\b|\byönlendirici\b|\bAltyapı\b|\bAltyapi\b|\bOluşturucu\b|\bOlusturucu\b|\bYöneticisi\b|\bYoneticisi\b|\sGeçidi\b|\sGecidi\b|\bKatmanı\b|\bKatmani\b|\bBilgileri\b|\bKimliği\b|\bKimligi\b|\bCihazlar\b|\bYetenek\b|\bGörevleri\b|\bGorevleri\b|\bArka\s+Plan\b|\bBağlı\b|\bBagli\b|\bBitiş\b|\bBitis\b|\bNoktası\b|\bNoktasi\b|\bErişim\b|\bErisim\b|\bWindows\s+Ses\b|\bHazır\b|\bHazir\b|\bYönetimi\b|\bYonetimi\b|\bDurumu\b|\bModu\b|\bTürü\b|\bTuru\b|\bAtamalı\b|\bAtamali\b|\bHatalı\b|\bHatali\b|\bBildirimi\b|\bRaporlaması\b|\bRaporlamasi\b|\bHata\s+demeti\b|\bOlay\s+Adı\b|\bOlay\s+adi\b|\bÖzel\s+durum\b|\bOzel\s+durum\b|\bmodül\b|\bmodul\b|\bzaman\s+damgası\b|\bzaman\s+damgasi\b|\bRapor\s+kimliği\b|\bRapor\s+kimligi\b|\bWindows\s+ile\s+birlikte\s+çalışmayı\b|\bWindows\s+ile\s+birlikte\s+calismayi\b/i.test(
        u
      ) ||
      /** MSInfo category paths + summary values often ASCII-only (“Mobil”, “Orta Avrupa Yaz Saati”). */
      /\bSistem\s+özeti\b|\bSistem\s+ozeti\b|\bBileşenler\b|\bBilesenler\b|\bPlatform\s+Rolü\b|\bPlatform\s+Rolu\b|\bSaat\s+Dilimi\b|\bSaat\s+dilimi\b|\bOrta\s+Avrupa\b|\bAvrupa\s+Yaz\b|\bYaz\s+Saati\b|\bStandart\s+Saati\b|\bTürkiye\s+Standart\b|\bTurkiye\s+Standart\b|\bMantıksal\b|\bMantiksal\b|\bÖğe\b|\bOge\b|\bBağdaştırıcı\b|\bBagdastirici\b/i.test(
        u
      ) ||
      /(^|[\s,:;])(Mobil)([\s,:;)]|$)/i.test(u)
    );
  }

  /**
   * Spanish MSInfo strings are often ASCII-only (“Resumen del sistema”, “Nombre del SO”); still needs Translate.
   * @param {string} s
   */
  function looksLikeSpanishWindowsLatinHint(s) {
    const u = String(s || "");
    return (
      /\bResumen\s+del\s+sistema\b|\bNombre\s+del\s+SO\b|\bEntorno\s+de\s+software\b|\bInformes?\s+de\s+errores\s+de\s+Windows\b|\bInforme\s+de\s+errores\s+de\s+Windows\b|\bcontenedor\s+de\s+errores\b|\bDep[oó]sito\s+con\s+errores\b|\bIdentificador\s+de\s+archivo\b|\bFabricante\s+del\s+sistema\b|\bFabricante\s+del\s+SO\b|\bDirectorio\s+de\s+Windows\b|\bId\.\s+del\s+producto\b|\bCompilación\s+del\s+SO\b|\bZona\s+horaria\b|\bTipo\s+de\s+sistema\b|\bMemoria\s+física\b|\bMemoria\s+fisica\b|\bMemoria\s+virtual\b|\bSímbolo\s+de\s+análisis\b|\bSimbolo\s+de\s+analisis\b|\bArchivos\s+adjuntos\b|\bFirma\s+del\s+problema\b|\bNombre\s+del\s+evento\b|\bEstado\s+del\s+informe\b|\bIdentificador\s+de\s+informe\b|\baplicación\s+con\s+errores\b|\baplicacion\s+con\s+errores\b|\bdejó\s+de\s+interactuar\b|\bdejo\s+de\s+interactuar\b|\bPC\s+basado\s+en\s+(?:x\d+|arm64)\b|\bEquipo\s+basado\s+en\s+(?:x\d+|arm64)\b|\bOrdenador\s+basado\s+en\s+(?:x\d+|arm64)\b/i.test(
        u
      ) ||
      /\bHora\b.*\bTipo\b.*\bDetalles\b/is.test(u) ||
      /** GPU / display (ASCII; same strings as {@link translateMsinfoI18nTokensToEnglish} Spanish pass). */
      /\bcompatible\s+con\b/i.test(u) ||
      /\bno\s+disponible\b/i.test(u) ||
      /\bhercios\b/i.test(u) ||
      /\bSistema\s+de\s+archivos\b/i.test(u) ||
      /\bTamaño\s+total\b/i.test(u) ||
      /\bEspacio\s+libre\b/i.test(u) ||
      /\bDiscos\b/i.test(u) ||
      /\bTipo\s+de\s+sistema\b/i.test(u)
    );
  }

  /**
   * French (fr-FR / fr-CA) MSInfo strings — “Résumé système”, “Bureau” (platform role = Desktop), “Mémoire…”, “Go” sizes.
   * @param {string} s
   */
  function looksLikeFrenchWindowsLatinHint(s) {
    const u = String(s || "");
    return (
      /\bR[ée]sum[ée]\s+syst[eè]me\b|\bM[ée]moire\s+physique\b|\bM[ée]moire\s+virtuelle\b|\bEnvironnement\s+logiciel\b|\bFuseaux?\s+horaires?\b|\bR[ôo]le\s+de\s+la\s+plateforme\b|\bBureau\b|\bNom\s+du\s+syst[eè]me\b|\bordinateur\s+.{0,20}processeur\b|\bprocesseur\(?s\)?\s+logique/i.test(
        u
      ) ||
      /\b\d+[\d,.\s]*\s*Go\b/i.test(u) ||
      /\bÉl[ée]ment\b.*\bValeur\b|Élément\s*=/is.test(u)
    );
  }

  /**
   * Portuguese (pt-BR / pt) MSInfo strings — often ASCII + diacritics (“Resumo do sistema”, “Nome do sistema operacional”).
   * @param {string} s
   */
  function looksLikePortugueseWindowsLatinHint(s) {
    const u = String(s || "");
    return (
      /\bResumo\s+do\s+sistema\b|\bNome\s+do\s+[Ss]istema\s+Operacional\b|\bInforma[cç][oõ]es\s+do\s+sistema\b|\bAmbiente\s+de\s+software\b|\bRelat[oó]rios?\s+de\s+[Ee]rros\s+do\s+Windows\b|\bFun[cç][aã]o\s+da\s+[Pp]lataforma\b|\b[Aa]rea\s+de\s+[Tt]rabalho\b|\bPC\s+baseado\s+em\b|\bTipo\s+do\s+sistema\b|\bFabricante\s+da\s+[Bb]aseBoard\b|\bProduto\s+[Bb]aseBoard\b|\bMem[oó]ria\s+f[ií]sica\b|\bFuso\s+hor[aá]rio\b|\bHora\s+oficial\s+do\s+Brasil\b|\bLocalidade\b|\bArmazenamento\b|\bUnidade\s+local\b|\bSistema\s+de\s+arquivos\b|\bDesativado\b|\b[Aa]rea\s+de\s+trabalho\b/i.test(
        u
      ) ||
      /** WER / fault text (often ASCII; still needs section Translate + phrase map). */
      /\bNome\s+do\s+aplicativo\s+com\s+falha\b|\bCaminho\s+do\s+aplicativo\s+com\s+falha\b|\bC[oó]digo\s+de\s+exce[cç][aã]o\b|\bTipo\s+de\s+adaptador\b|\bGateway\s+IP\s+padr[aã]o\b|\bConcess[aã]o\s+DHCP\b|\bEsses\s+arquivos\s+talvez\b|\bVerificando\s+novamente\b|\bStatus\s+do\s+Relatório\b|\bBucket\s+com\s+hash\b/i.test(
        u
      ) ||
      /\bItem\b.*\bValor\b/is.test(u) ||
      /** Processor summary line (mixed EN/pt-BR): “8 Núcleo(s), 16 Processor(es) Lógico(s)”. */
      /\bN[uú]cleo\(s\)\b|\bProcessor\(es\)\s+L[oó]gico\(s\)\b|\bProcessador\(es\)\s+L[oó]gico\(s\)\b|\bprocessadores\s+l[oó]gicos\b/i.test(
        u
      )
    );
  }

  /**
   * Swedish (sv) MSInfo / Windows UI — “8 kärnor, 16 logiska processorer” and time zone text are often mostly ASCII.
   * @param {string} s
   */
  function looksLikeSwedishWindowsLatinHint(s) {
    const u = String(s || "");
    return (
      /\bSystemöversikt\b|\bProgrammiljö\b|\bPlattformsroll\b|\bOperativsystemets\s+namn\b|\bDrivrutinsversion\b|\bDatortyp\b|\blogiska\s+processorer\b|\bkärnor\b|\bnormaltid\b|\bVästeuropa\b|\bStationär\s+dator\b|\bBildskärm\b|\bGrafikkort\b|\bMaskinvaruresurser\b|\bTyp\s+av\s+dator\b|\bx64-baserad\s+dator\b|\bTjänst\b|\btjänst\b|\bEnheter\b|\bVolymens\s+namn\b|\bLedigt\s+utrymme\b|\bBaskortstillverkare\b|\bBaskortsprodukt\b|\bStorlek\b/i.test(
        u
      ) || /\bObjekt\b.*\bVärde\b/is.test(u)
    );
  }

  /**
   * Ukrainian (uk-UA) MSInfo — distinct from Russian ({@code і}/{@code ї}/{@code є}, {@code Елемент}/{@code Значення} tags, {@code Відомості про систему}).
   * @param {string} s
   */
  function looksLikeUkrainianWindowsCyrillicHint(s) {
    const u = String(s || "");
    /** JS {@code \b} word boundaries are ASCII-only — do not use {@code \b} around Cyrillic (paths then fail to match). */
    return (
      /Відомості\s+про\s+систему|Програмне\s+середовище|Назва\s+ОС|Установлена\s+фізична\s+пам/i.test(u) ||
      /Робочий\s+стіл|Збірка|Недоступно|Системні\s+драйвери|Змінні\s+оточення|Мережеві\s+підключення/i.test(u) ||
      /ядер\s+\d+,\s*логічних\s+процесорів|логічних\s+процесорів|елемент|значення/i.test(u) ||
      /Пристрої\s+з\s+неполадками|Компоненти|Зберігання/i.test(u)
    );
  }

  /**
   * Counts how many distinct token signals match in {@code blob}; used to bump confidence when many of a locale's
   * marker phrases appear together (one signal could be coincidence; six is the locale).
   * @param {string} blob
   * @param {RegExp[]} signals
   * @returns {number}
   */
  function countLocaleSignals(blob, signals) {
    let n = 0;
    for (const re of signals) if (re.test(blob)) n++;
    return n;
  }

  /**
   * Boosts the base confidence when several distinct signals fired (n ≥ 3 → +0.05, n ≥ 5 → +0.08).
   * @param {number} base
   * @param {number} n
   */
  function bumpConfidence(base, n) {
    if (n >= 5) return Math.min(0.99, base + 0.08);
    if (n >= 3) return Math.min(0.99, base + 0.05);
    return base;
  }

  /**
   * Best-effort offline UI language guess for MSInfo / Windows strings (no network). Scripts first, then Latin locales.
   * Returns {@code confidence} ∈ [0, 1] — higher when multiple signals agree, so the Language Adder can flag
   * low-confidence detections in its export.
   * @param {string} blob
   * @returns {{ code: string, name: string, confidence: number }}
   */
  function detectOfflineUiLanguage(blob) {
    const b = String(blob || "");
    if (!b.trim()) return { code: "unknown", name: "Unknown", confidence: 0 };
    /** Script-based prelim detection — these scripts are exclusive to a single language family. */
    if (/[\u0600-\u06FF]/.test(b)) {
      /** Persian (fa) and Urdu (ur) overlap with Arabic block — disambiguate on diacritics. */
      if (/[\u067E\u0686\u0698\u06A9\u06AF\u06CC]/.test(b)) {
        if (/\bسیستم|پیکربندی|نسخه|پردازنده/.test(b)) return { code: "fa", name: "Persian", confidence: 0.92 };
      }
      return { code: "ar", name: "Arabic", confidence: 0.95 };
    }
    if (/[\u0590-\u05FF]/.test(b)) return { code: "he", name: "Hebrew", confidence: 0.95 };
    if (/[\u3040-\u30FF\u31F0-\u31FF]/.test(b)) return { code: "ja", name: "Japanese", confidence: 0.99 };
    if (/[\uAC00-\uD7AF]/.test(b)) return { code: "ko", name: "Korean", confidence: 0.99 };
    if (/[\u0400-\u04FF]/.test(b)) {
      /** Distinct Cyrillic locales: Bulgarian / Serbian / Macedonian / Belarusian. */
      if (/Системна\s+информация|Информация\s+за\s+системата|Часова\s+зона/i.test(b))
        return { code: "bg", name: "Bulgarian", confidence: 0.9 };
      if (/Системске\s+информације|Подаци\s+о\s+систему|Преглед\s+система|Хардвер/i.test(b))
        return { code: "sr", name: "Serbian", confidence: 0.88 };
      if (/Сістэма|сістэмы|Працэсар|Праграмнае/i.test(b))
        return { code: "be", name: "Belarusian", confidence: 0.9 };
      /** Strong MSInfo path/item signals (ASCII {@code \b} misses Cyrillic; paths must still resolve here). */
      const ukSignals = [
        /Відомості\s+про\s+систему/i,
        /Програмне\s+середовище/i,
        /Зберігання\s*\//i,
        /Компоненти\s*\//i,
        /\bелемент\b/iu,
        /\bзначення\b/iu,
        /логічних\s+процесорів/i,
        /Робочий\s+стіл/i,
        /Збірка\s+\d+/i,
        /Часовий\s+пояс/i,
        /Назва\s+ОС/i,
      ];
      const ukHits = countLocaleSignals(b, ukSignals);
      if (ukHits >= 2) return { code: "uk", name: "Ukrainian", confidence: bumpConfidence(0.92, ukHits) };
      if (looksLikeUkrainianWindowsCyrillicHint(b)) return { code: "uk", name: "Ukrainian", confidence: 0.9 };
      const ruSignals = [
        /Сведения\s+о\s+системе/i,
        /Программная\s+среда/i,
        /Системные\s+драйверы/i,
        /Операционная\s+система/i,
        /Часовой\s+пояс/i,
        /Сборка\s+\d+/i,
        /\bядер\s+\d+/i,
        /\bлогических\s+процессоров/i,
        /Рабочий\s+стол/i,
      ];
      const ruHits = countLocaleSignals(b, ruSignals);
      if (ruHits >= 2) return { code: "ru", name: "Russian", confidence: bumpConfidence(0.95, ruHits) };
      return { code: "ru", name: "Russian", confidence: 0.85 };
    }
    if (/[\u0370-\u03FF]/.test(b)) return { code: "el", name: "Greek", confidence: 0.95 };
    if (/[\u0E00-\u0E7F]/.test(b)) return { code: "th", name: "Thai", confidence: 0.95 };
    if (/[\u0E80-\u0EFF]/.test(b)) return { code: "lo", name: "Lao", confidence: 0.9 };
    if (/[\u0980-\u09FF]/.test(b)) return { code: "bn", name: "Bengali", confidence: 0.9 };
    if (/[\u0900-\u097F]/.test(b)) return { code: "hi", name: "Hindi", confidence: 0.9 };
    if (/[\u0A00-\u0A7F]/.test(b)) return { code: "pa", name: "Punjabi", confidence: 0.9 };
    if (/[\u0980-\u09FF]/.test(b)) return { code: "bn", name: "Bengali", confidence: 0.9 };
    if (/[\u0B80-\u0BFF]/.test(b)) return { code: "ta", name: "Tamil", confidence: 0.9 };
    if (/[\u0C00-\u0C7F]/.test(b)) return { code: "te", name: "Telugu", confidence: 0.9 };
    if (/[\u0CB0-\u0CFF]/.test(b)) return { code: "kn", name: "Kannada", confidence: 0.9 };
    if (/[\u0D00-\u0D7F]/.test(b)) return { code: "ml", name: "Malayalam", confidence: 0.9 };
    if (/[\u0AB0-\u0AFF]/.test(b)) return { code: "gu", name: "Gujarati", confidence: 0.9 };
    if (/[\u3400-\u9FFF]/.test(b) && !/[\u3040-\u30FF]/.test(b)) {
      if (/繁體|繁体|簡體|简体/.test(b) || /[\uF900-\uFAFF]/.test(b)) return { code: "zh-Hant", name: "Traditional Chinese", confidence: 0.9 };
      return { code: "zh", name: "Chinese", confidence: 0.92 };
    }
    if (looksLikeTurkishWindowsLatinHint(b)) return { code: "tr", name: "Turkish", confidence: 0.9 };
    /** Latin-script locales: count signals so confidence reflects how confident we are. */
    const latinTests = [
      { code: "hu", name: "Hungarian", base: 0.88, signals: [
        /Rendszerösszefoglaló/i, /Időzóna/i, /Illesztőprogram/i, /Operációs\s+rendszer/i, /Telepítés\s+dátuma/i, /Alapértelmezett\s+átjáró/i,
      ]},
      { code: "de", name: "German", base: 0.88, signals: [
        /Systemübersicht/i, /Zeitzone/i, /Betriebssystem/i, /Arbeitsspeicher/i, /Gerätetreiber/i, /Treiberversion/i,
        /Auslagerungsdatei/i, /Standardgateway/i,
      ]},
      { code: "it", name: "Italian", base: 0.88, signals: [
        /Informazioni\s+di\s+sistema/i, /Ambiente\s+software/i, /Memoria\s+fisica/i, /Zona\s+oraria/i,
        /Versione\s+del\s+sistema/i, /Gateway\s+predefinito/i,
      ]},
      { code: "nl", name: "Dutch", base: 0.88, signals: [
        /Systeemoverzicht/i, /Software-omgeving/i, /Tijdzone/i, /Besturingssysteem/i, /Stuurprogramma/i, /Standaardgateway/i,
      ]},
      { code: "pl", name: "Polish", base: 0.88, signals: [
        /Podsumowanie\s+systemu/i, /Pamięć\s+fizyczna/i, /Strefa\s+czasowa/i, /Sterownik/i, /Adapter\s+sieciowy/i,
      ]},
      { code: "cs", name: "Czech", base: 0.88, signals: [
        /Přehled\s+systému/i, /Softwarové\s+prostředí/i, /Časové\s+pásmo/i, /Ovladač/i, /Výchozí\s+brána/i,
      ]},
      { code: "sk", name: "Slovak", base: 0.85, signals: [
        /Súhrn\s+systému/i, /Časové\s+pásmo/i, /Ovládač/i, /Predvolená\s+brána/i,
      ]},
      { code: "sl", name: "Slovenian", base: 0.82, signals: [
        /Povzetek\s+sistema/i, /Časovni\s+pas/i, /Gonilnik/i, /Privzeti\s+prehod/i,
      ]},
      { code: "hr", name: "Croatian", base: 0.82, signals: [
        /Sažetak\s+sustava/i, /Vremenska\s+zona/i, /Upravljački\s+program/i, /Zadani\s+pristupnik/i,
      ]},
      { code: "ro", name: "Romanian", base: 0.85, signals: [
        /Rezumat\s+sistem/i, /Memorie\s+fizică/i, /Fus\s+orar/i, /Driver/i, /Poarta\s+implicită/i,
      ]},
      { code: "fi", name: "Finnish", base: 0.88, signals: [
        /Järjestelmäyhteenveto/i, /Ohjelmistoympäristö/i, /Aikavyöhyke/i, /Ohjain/i, /Oletusyhdyskäytävä/i,
      ]},
      { code: "et", name: "Estonian", base: 0.82, signals: [
        /Süsteemi\s+kokkuvõte/i, /Tarkvara\s+keskkond/i, /Ajavöönd/i, /Draiver/i, /Vaikimisi\s+lüüs/i,
      ]},
      { code: "lt", name: "Lithuanian", base: 0.82, signals: [
        /Sistemos\s+suvestinė/i, /Laiko\s+juosta/i, /Tvarkyklė/i, /Numatytasis\s+tinklų\s+sietuvas/i,
      ]},
      { code: "lv", name: "Latvian", base: 0.82, signals: [
        /Sistēmas\s+kopsavilkums/i, /Laika\s+josla/i, /Draiveris/i, /Noklusētais\s+vārteja/i,
      ]},
      { code: "vi", name: "Vietnamese", base: 0.85, signals: [
        /Thông\s+tin\s+hệ\s+thống/i, /Hệ\s+điều\s+hành/i, /Múi\s+giờ/i, /Bộ\s+nhớ/i, /Trình\s+điều\s+khiển/i,
      ]},
      { code: "id", name: "Indonesian", base: 0.82, signals: [
        /Informasi\s+sistem/i, /Lingkungan\s+perangkat\s+lunak/i, /Zona\s+waktu/i, /Driver/i, /Memori\s+fisik/i,
      ]},
      { code: "no", name: "Norwegian", base: 0.82, signals: [
        /Systeminformasjon/i, /Tidssone\s+for/i, /Programvaremiljø/i, /Driver/i,
      ]},
      { code: "da", name: "Danish", base: 0.82, signals: [
        /Systemoversigt/i, /Programvaremiljø/i, /Tidssone/i, /Driver/i,
      ]},
    ];
    for (const t of latinTests) {
      const hits = countLocaleSignals(b, t.signals);
      if (hits >= 1) return { code: t.code, name: t.name, confidence: bumpConfidence(t.base, hits) };
    }
    if (looksLikeFrenchWindowsLatinHint(b)) return { code: "fr", name: "French", confidence: 0.9 };
    if (looksLikePortugueseWindowsLatinHint(b)) return { code: "pt", name: "Portuguese", confidence: 0.85 };
    if (looksLikeSpanishWindowsLatinHint(b)) return { code: "es", name: "Spanish", confidence: 0.85 };
    if (looksLikeSwedishWindowsLatinHint(b)) return { code: "sv", name: "Swedish", confidence: 0.85 };
    /** Loose ASCII MSInfo English — sometimes the export is in English even when filename suggests otherwise. */
    if (/System Summary|Software Environment|Operating System|Time Zone|Default IP Gateway/.test(b))
      return { code: "en", name: "English", confidence: 0.7 };
    return { code: "unknown", name: "Unknown", confidence: 0.45 };
  }

  /** Maps detection codes to safe English filenames for Language Adder downloads. */
  const LANGUAGE_ADDER_FILENAME_LABEL = /** @type {const} */ ({
    ar: "Arabic",
    fa: "Persian",
    he: "Hebrew",
    ja: "Japanese",
    ko: "Korean",
    ru: "Russian",
    uk: "Ukrainian",
    bg: "Bulgarian",
    sr: "Serbian",
    be: "Belarusian",
    el: "Greek",
    th: "Thai",
    lo: "Lao",
    bn: "Bengali",
    hi: "Hindi",
    pa: "Punjabi",
    ta: "Tamil",
    te: "Telugu",
    kn: "Kannada",
    ml: "Malayalam",
    gu: "Gujarati",
    zh: "Chinese",
    "zh-Hant": "Traditional Chinese",
    tr: "Turkish",
    hu: "Hungarian",
    de: "German",
    it: "Italian",
    nl: "Dutch",
    pl: "Polish",
    cs: "Czech",
    sk: "Slovak",
    sl: "Slovenian",
    hr: "Croatian",
    ro: "Romanian",
    fi: "Finnish",
    et: "Estonian",
    lt: "Lithuanian",
    lv: "Latvian",
    vi: "Vietnamese",
    id: "Indonesian",
    no: "Norwegian",
    da: "Danish",
    fr: "French",
    pt: "Portuguese",
    es: "Spanish",
    sv: "Swedish",
    en: "English",
  });

  /**
   * @param {string} s
   * @returns {string}
   */
  function sanitizeLanguageAdderFileStem(s) {
    return String(s || "")
      .replace(/\.[^.]+$/, "")
      .replace(/[^A-Za-z0-9._-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 48);
  }

  /**
   * Preferred download stem: detected language name, else code label, else user/file stem.
   * @param {{ detectedLanguageName?: string, detectedLanguageCode?: string, detectedLanguageConfidence?: number } | null | undefined} diag
   * @param {string} fallbackStem
   */
  function languageAdderExportBasename(diag, fallbackStem) {
    const conf = Number(diag?.detectedLanguageConfidence ?? 0);
    const name = String(diag?.detectedLanguageName || "").trim();
    const code = String(diag?.detectedLanguageCode || "").trim().toLowerCase();
    const minConf = 0.55;
    if (name && name !== "Unknown" && conf >= minConf) {
      const stem = sanitizeLanguageAdderFileStem(name);
      if (stem) return stem;
    }
    if (code && code !== "unknown" && conf >= minConf) {
      const lab = LANGUAGE_ADDER_FILENAME_LABEL[/** @type {keyof typeof LANGUAGE_ADDER_FILENAME_LABEL} */ (code)];
      if (lab) return sanitizeLanguageAdderFileStem(lab);
    }
    const fb = sanitizeLanguageAdderFileStem(fallbackStem);
    return fb || "language-adder";
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
    /** Latin-1 letters (ü, ö, ç, ñ, …) — needed for Turkish/German/etc. not covered by U+0100+. */
    if (/[\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF]/.test(t)) return true;
    /** Turkish MSInfo sizes often use ASCII “Bayt” / “…bayt” with no accented letters — still needs Translate. */
    if (/\bBayt\b/i.test(t)) return true;
    if (/\b(Giga|Mega|Tera|Kilo)bayt\b/i.test(t)) return true;
    /** “Derleme” (build) and similar OS strings are Turkish but all-ASCII. */
    if (/\bDerleme\b/i.test(t)) return true;
    if (/\bİşletim\b/i.test(t) || /\bIsletim\b/i.test(t)) return true;
    /** Turkish display exports: “NVIDIA uyumlu”, etc. (ASCII-only; needs Translate + phrase map). */
    if (/\buyumlu\b/i.test(t)) return true;
    /** Turkish platform role + EU time zones often have no Turkish-specific letters. */
    if (/\bOrta\s+Avrupa\b/i.test(t)) return true;
    if (/\b(Yaz|Kış|Kis)\s+Saati\b/i.test(t)) return true;
    if (/^Mobil$/i.test(t.trim())) return true;
    if (looksLikeTurkishWindowsLatinHint(t)) return true;
    if (looksLikeSpanishWindowsLatinHint(t)) return true;
    if (looksLikeFrenchWindowsLatinHint(t)) return true;
    if (looksLikePortugueseWindowsLatinHint(t)) return true;
    if (looksLikeSwedishWindowsLatinHint(t)) return true;
    /** Spanish GPU / display strings often ASCII-only (“compatible con”, “hercios”). */
    if (/\bcompatible\s+con\b/i.test(t)) return true;
    if (/\bno\s+disponible\b/i.test(t)) return true;
    if (/\bhercios\b/i.test(t)) return true;
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
   * Ukrainian (uk-UA) MSInfo / Windows UI → English (offline phrase map).
   * @type {readonly (readonly [string, string])[]}
   */
  const LOCALE_PAIRS_MSINFO_UK = [
    [
      "Безпека на основі віртуалізації: обов’язкові властивості безпеки",
      "Virtualization-based security Required Security Properties",
    ],
    [
      "Безпека на основі віртуалізації: доступні властивості безпеки",
      "Virtualization-based security Available Security Properties",
    ],
    ["Безпека на основі віртуалізації: налаштовані служби", "Virtualization-based security Configured Services"],
    ["Безпека на основі віртуалізації: запущені служби", "Virtualization-based security Running Services"],
    ["Безпека на основі віртуалізації", "Virtualization-based security"],
    [
      "Виявлено гіпервізор. Функції, що потребують Hyper-V, не відображатимуться.",
      "A hypervisor has been detected. Features required for Hyper-V will not be displayed.",
    ],
    [
      "Підтримка автоматичного шифрування пристрою",
      "Automatic device encryption support",
    ],
    [
      "Політика режиму користувача служби керування програмами для бізнесу",
      "Enterprise Application Control user mode policy",
    ],
    ["Політика керування програмами для бізнесу", "Enterprise Application Control policy"],
    ["Захист ПДП ядра", "Kernel DMA Protection"],
    ["Гігагайта", "gigabytes"],
    ["Гігабайт", "gigabyte"],
    ["Мегабайта", "megabytes"],
    ["Мегабайт", "megabyte"],
    ["Терабайта", "terabytes"],
    ["Терабайт", "terabyte"],
    ["Кілобайта", "kilobytes"],
    ["Кілобайт", "kilobyte"],
    /** Ukrainian disk drive / time zone / locale strings frequently seen in MSInfo. */
    ["байтів", "bytes"],
    ["байтiв", "bytes"],
    ["байт", "bytes"],
    ["(літо)", "(summer)"],
    ["(зима)", "(winter)"],
    ["Фінляндія", "Finland"],
    ["Україна", "Ukraine"],
    ["Майкрософт Windows", "Microsoft Windows"],
    ["Майкрософт", "Microsoft"],
    ["ГБ", "GB"],
    ["ТБ", "TB"],
    ["МБ", "MB"],
    ["КБ", "KB"],
    ["МГц", "MHz"],
    ["мГц", "MHz"],
    ["ГГц", "GHz"],
    ["гГц", "GHz"],
    ["Гц", "Hz"],
    /** Ukrainian display / GPU adapter strings ("…-сумісний"). */
    ["NVIDIA-сумісний", "NVIDIA-compatible"],
    ["AMD-сумісний", "AMD-compatible"],
    ["Intel-сумісний", "Intel-compatible"],
    ["Direct3D-сумісний", "Direct3D-compatible"],
    ["Advanced Micro Devices, Inc.-сумісний", "Advanced Micro Devices, Inc.-compatible"],
    ["сумісний відеоадаптер", "compatible video adapter"],
    ["сумісний", "compatible"],
    /** Ukrainian Windows Error Reporting (WER) detail labels seen in this MSInfo file. */
    ["Сегмент пам'яті з помилкою", "Faulting bucket"],
    ["Сегмент пам’яті з помилкою", "Faulting bucket"],
    ["Гешований сегмент пам'яті", "Hashed container"],
    ["Гешований сегмент пам’яті", "Hashed container"],
    ["Ім'я події", "Event name"],
    ["Ім’я події", "Event name"],
    ["Імʼя події", "Event name"],
    ["Відповідь:", "Response:"],
    ["Відповідь", "Response"],
    ["Код CAB-файлу", "CAB file ID"],
    ["GUID CAB-файлу", "CAB file GUID"],
    ["Підпис проблеми", "Problem signature"],
    ["Вкладені файли", "Attached files"],
    ["Можливе розташування файлів", "Files that may be available"],
    ["Символ аналізу", "Analysis symbol"],
    ["Повторний пошук рішення", "Re-checking for a solution"],
    ["Код звіту", "Report ID"],
    ["Стан звіту", "Report status"],
    ["Звітування про критичні помилки Windows", "Windows Error Reporting"],
    /** Ukrainian Windows service display names (from language-adder export). */
    ["Антивірус для Microsoft Defender", "Microsoft Defender Antivirus"],
    ["Брандмауер для Захисника Windows", "Windows Defender Firewall"],
    ["Служба мережевої перевірки Антивірусу для Microsoft Defender", "Microsoft Defender Antivirus Network Inspection Service"],
    ["Основна служба Microsoft Defender", "Microsoft Defender Core Service"],
    ["Служба \"Безпека у Windows\"", "Windows Security Service"],
    ["Служба настроювання мережі", "Network Setup Service"],
    ["Служба сховища", "Storage Service"],
    ["Служба списку мереж", "Network List Service"],
    ["Служба телефонного зв’язку", "Telephony"],
    ["Служба телефонного зв'язку", "Telephony"],
    ["Служба HID", "Human Interface Device Service"],
    ["Служба інсталяції Microsoft Store", "Microsoft Store Install Service"],
    ["Служба користувача сповіщень Windows", "Windows Push Notifications User Service"],
    ["Служба користувачів буфера обміну", "Clipboard User Service"],
    ["Служба підтримки користувача Bluetooth", "Bluetooth User Support Service"],
    ["Служба ліцензій клієнта (ClipSVC)", "Client License Service (ClipSVC)"],
    ["Служба завантаження зображень Windows", "Windows Image Acquisition (WIA)"],
    ["Служба оцінювання Windows", "Windows Assessment Service"],
    ["Служба спільного доступу до мережі медіапрогравача Windows", "Windows Media Player Network Sharing Service"],
    ["Служба Windows \"Мобільна точка доступу\"", "Windows Mobile Hotspot Service"],
    ["Служба Оновлення ASUS (asus)", "ASUS Update Service (asus)"],
    ["Служба Оновлення ASUS (asusm)", "ASUS Update Service (asusm)"],
    ["Внутрішній сервіс оновлення Google", "Google Updater Internal Service"],
    ["Сервіс оновлення Google", "Google Updater Service"],
    ["Windows Connect Now – реєстрація настройок", "Windows Connect Now - Config Registrar"],
    ["Автонастроювання WLAN", "WLAN AutoConfig"],
    ["Автоконфігурування проводових підключень", "Wired AutoConfig"],
    ["Батьківський контроль", "Parental Controls"],
    ["Визначення устаткування оболонки", "Shell Hardware Detection"],
    ["Використання даних", "Data Usage"],
    ["Диспетчер облікових даних", "Credential Manager"],
    ["Доступ до даних користувача", "User Data Access"],
    ["Зберігання даних користувача", "User Data Storage"],
    ["Контактні дані", "Contact Data"],
    ["Контейнер Microsoft Passport", "Microsoft Passport Container"],
    ["Клієнт групової політики", "Group Policy Client"],
    ["Мережні підключення", "Network Connections"],
    ["Мережева служба Xbox Live", "Xbox Live Networking Service"],
    ["Збереження гри в Xbox Live", "Xbox Live Game Save"],
    ["Планувальник завдань", "Task Scheduler"],
    ["Функціональні можливості для підключених користувачів і телеметрія", "Connected User Experiences and Telemetry"],
    ["Відомості про мережеве розташування", "Network Location Awareness"],
    ["Диспетчер завантажених карт", "Downloaded Maps Manager"],
    ["Додатковий вхід", "Secondary Logon"],
    ["Засіб відображення топології канального рівня", "Link-Layer Topology Discovery Mapper"],
    ["Інсталятор Windows", "Windows Installer"],
    ["Керування застосунками", "Application Management"],
    ["Оптимізація роботи дисків", "Optimize drives"],
    ["Передавання сертифікатів", "Certificate Propagation"],
    ["Переривання SNMP", "SNMP Trap"],
    ["Переспрямовувач портів для режиму користувача служб віддалених робочих столів", "Remote Desktop Services UserMode Port Redirector"],
    ["Підтримка панелі керування \"Звіти про неполадки\"", "Problem Reports Control Panel Support"],
    ["Політика видалення смарт-картки", "Smart Card Removal Policy"],
    ["Рекомендована служба усунення неполадок", "Recommended Troubleshooting Service"],
    ["Розширення та сповіщення принтера", "Printer Extensions and Notifications"],
    ["Смарт-картка", "Smart Card"],
    ["Телефонія", "Telephony"],
    ["Установлена фізична пам’ять (ОЗП)", "Installed Physical Memory (RAM)"],
    ["Установлена фізична память (ОЗП)", "Installed Physical Memory (RAM)"],
    ["Загальний обсяг фізичної пам'яті", "Total Physical Memory"],
    ["Доступно фізичної пам'яті", "Available Physical Memory"],
    ["Усього віртуальної пам'яті", "Total Virtual Memory"],
    ["Доступно віртуальної пам'яті", "Available Virtual Memory"],
    ["Розмір файлу довантаження", "Page File Space"],
    ["Файл довантаження", "Page File"],
    ["Розташування файлу довантаження", "Page File Location(s)"],
    ["Розташування файлів довантаження", "Page File Location(s)"],
    ["Апаратнозалежний рівень (HAL)", "Hardware Abstraction Layer"],
    ["Версія BIOS/Дата", "BIOS Version/Date"],
    ["Модель BIOS", "BIOS Mode"],
    ["Стан безпечного завантаження", "Secure Boot State"],
    ["Конфігурація PCR7", "PCR7 Configuration"],
    ["Папка Windows", "Windows Directory"],
    ["Системна папка", "System Directory"],
    ["Пристрій завантаження", "Boot Device"],
    ["Часовий пояс", "Time Zone"],
    ["Ім'я користувача", "User Name"],
    ["Виробник ОС", "OS Manufacturer"],
    ["Назва ОС", "OS Name"],
    ["Назва системи", "System Name"],
    ["Виробник", "Manufacturer"],
    ["Інший опис ОС", "Other OS Description"],
    ["Обліковий номер системи", "System SKU"],
    ["Мова", "Locale"],
    ["версія вбудованого контролера", "Embedded Controller Version"],
    ["Версія SMBIOS", "SMBIOS Version"],
    ["Тип системної плати", "BaseBoard Product"],
    ["Виробник системної плати", "BaseBoard Manufacturer"],
    ["Версія системної плати", "BaseBoard Version"],
    ["Роль платформи", "Platform Role"],
    ["Робочий стіл", "Desktop"],
    ["Недоступно", "Not available"],
    ["Увімкнути", "On"],
    ["Вимкнути", "Off"],
    ["Запущено", "Running"],
    ["Застосовано", "Enforced"],
    ["Аудит", "Audit"],
    ["Прив'язка неможлива", "Cannot bind"],
    ["логічних процесорів", "logical processors"],
    ["Корпорація Майкрософт", "Microsoft Corporation"],
    ["Програмне середовище / Повідомлення про помилки Windows", "Software Environment / Windows Error Reporting"],
    ["Повідомлення про помилки Windows", "Windows Error Reporting"],
    ["Програмне середовище", "Software Environment"],
    ["Збірка", "Build"],
    ["Версія", "Version"],
    ["Процесор", "Processor"],
  ];

  /**
   * Ukrainian MSInfo **Item** column labels (components, network, storage, serial) from Language Adder exports.
   * Longer strings win at merge time; keep full phrases before short words like {@code Тип} / {@code Стан}.
   * @type {readonly (readonly [string, string])[]}
   */
  const LOCALE_PAIRS_MSINFO_UK_LABELS = [
    ["Перевірку парності ввімк.", "Parity check enabled"],
    ["Перервати читання/запис у разі помилки", "Abort on read/write error"],
    ["Підтримка гарантованої пропускної здатності", "Guaranteed bandwidth support"],
    ["Підтримка даних з'єднання", "Connection-oriented data support"],
    ["Підтримка даних роз'єднання", "Connectionless data support"],
    ["Підтримка мультиадресності", "Multicast support"],
    ["Підтримка поступового закриття", "Graceful closing support"],
    ["Підтримка прискореної обробки", "Expedited data support"],
    ["Підтримка широкомовлення", "Broadcast support"],
    ["Підтримка шифрування", "Encryption support"],
    ["Підтримка 16-розрядного режиму", "16-bit mode supported"],
    ["Підтримка спеціальних символів", "Special character support"],
    ["Максимальний розмір буфера вводу", "Maximum input buffer size"],
    ["Максимальний розмір буфера виводу", "Maximum output buffer size"],
    ["Максимальний розмір повідомлення", "Maximum message size"],
    ["Максимальний розмір адреси", "Maximum address size"],
    ["Мінімальний розмір адреси", "Minimum address size"],
    ["Установлюване керування потоком", "Flow control configurable"],
    ["Установлювана перевірка парності", "Parity check configurable"],
    ["Настроювання під робочу руку", "Settings for right-handed"],
    ["Контроль вихідних XOnXOff", "XOn/XOff output control"],
    ["Контроль вхідних XOnXOff", "XOn/XOff input control"],
    ["Тип керування потоком DTR", "DTR flow control type"],
    ["Тип керування потоком RTS", "RTS flow control type"],
    ["Початковий зсув розділу", "Partition starting offset"],
    ["Елементи колірної таблиці", "Color table entries"],
    ["Логічний пристрій SCSI", "SCSI logical unit"],
    ["Підтримка керування живленням", "Power management supported"],
    ["Поріг подвійного клацання", "Double-click threshold"],
    ["Опис адаптера", "Adapter description"],
    ["Порт вводу/виводу", "I/O port"],
    ["Роздільна здатність", "Resolution"],
    ["Розрядів/піксель", "Bits/pixel"],
    ["Тип устаткування", "Hardware type"],
    ["Кількість функціональних клавіш", "Number of function keys"],
    ["Кількість кнопок", "Number of buttons"],
    ["Код PNP-пристрою", "PNP Device ID"],
    ["Серійний номер тому", "Volume serial number"],
    ["Шлюз IP за замовчуванням", "Default IP gateway"],
    ["DHCP-оренда закінчується", "DHCP lease expires"],
    ["DHCP-оренду отримано", "DHCP lease obtained"],
    ["MAC-адреса", "MAC address"],
    ["IP-підмережа", "IP subnet"],
    ["IRQ-канал", "IRQ channel"],
    ["Адреса пам'яті", "Memory address"],
    ["Гарантія послідовності", "Ordering guarantee"],
    ["Гарантія доставки", "Delivery guarantee"],
    ["Для псевдопотоків", "For pseudo-streams"],
    ["Для повідомлень", "For datagrams"],
    ["Тип адаптера", "Adapter type"],
    ["Тип продукту", "Product type"],
    ["Останнє скидання", "Last reset"],
    ["INF-файл", "INF file"],
    ["ОЗП адаптера", "Adapter RAM"],
    ["Колірні площини", "Color planes"],
    ["Файлова система", "File System"],
    ["Байт/сектор", "Bytes/sector"],
    ["Розмір розділу", "Partition size"],
    ["Треків/циліндр", "Tracks/cylinder"],
    ["Усього циліндрів", "Total cylinders"],
    ["Секторів/трек", "Sectors/track"],
    ["Усього секторів", "Total sectors"],
    ["Усього треків", "Total tracks"],
    ["Порт SCSI", "SCSI port"],
    ["Шина SCSI", "SCSI bus"],
    ["Тип носія", "Media type"],
    ["Ім'я служби", "Service name"],
    ["Імʼя служби", "Service name"],
    ["DHCP-сервер", "DHCP server"],
    ["DHCP увімк.", "DHCP enabled"],
    ["Служба без підключення", "Connectionless service"],
    ["Установлювані стоп-біти", "Stop bits configurable"],
    ["Установлювана розрядність", "Data bits configurable"],
    ["Установлювана швидкість", "Baud rate configurable"],
    ["Установлювана парність", "Parity configurable"],
    ["Установлювана RLSD", "RLSD configurable"],
    ["Підтримка RLSD", "RLSD supported"],
    ["Продовжувати XMit по XOff", "Continue Xmit on XOff"],
    ["Заміну за помилкою ввімк.", "Replace on error enabled"],
    ["Видаляти пусті байти", "Discard null bytes"],
    ["Увімкнено двійковий режим", "Binary mode enabled"],
    ["Швидкість передачі", "Baud rate"],
    ["Знак заміни за помилкою", "Error replacement character"],
    ["Контроль вихідних CTS", "CTS output control"],
    ["Контроль вихідних DSR", "DSR output control"],
    ["DSR-чутливість", "DSR sensitivity"],
    ["Біт/байт", "Bit/byte"],
    ["Зайнято", "Occupied"],
    ["Знак EOF", "EOF character"],
    ["Знак XOff", "XOff character"],
    ["Знак події", "Event character"],
    ["Парність", "Parity"],
    ["Поріг XOffXMit", "XOff threshold"],
    ["Поріг XOnXMit", "XOn threshold"],
    ["Символ XOn", "XOn character"],
    ["Стоп-біти", "Stop bits"],
    /** Multi-word service-table headers MUST come BEFORE the bare {@code Тип}/{@code Стан} pairs so they win in the length sort. */
    ["Тип запуску", "Startup type"],
    ["Тип_запуску", "Startup type"],
    ["Режим запуску", "Start mode"],
    ["Режим_запуску", "Start mode"],
    ["Поточний стан", "Current state"],
    ["Поточний_стан", "Current state"],
    ["Тип", "Type"],
    ["Стан", "Status"],
    ["Розмір", "Size"],
    ["Опис", "Description"],
    ["Розкладка", "Layout"],
    ["Розділ", "Partition"],
    ["Розділи", "Partitions"],
    ["Диск", "Disk"],
    ["Носій", "Media"],
    ["Вільно", "Free"],
    ["Стиснутий", "Compressed"],
    ["Файл", "File"],
    ["Індекс", "Index"],
    ["Ім'я", "Name"],
    ["Імʼя", "Name"],
    ["Ім'я тому", "Volume name"],
    ["Імʼя тому", "Volume name"],
  ];

  /**
   * Additional locales (Arabic, CJK, European Latin, Greek, Cyrillic variants, etc.) → English.
   * Merged with Russian; longest keys win globally after sort.
   * @type {readonly (readonly [string, string])[]}
   */
  const LOCALE_PAIRS_MSINFO_INTL = [
    // --- Turkish (tr) ---
    ["Yazılım Ortamı / Windows Hata Raporları", "Software Environment / Windows Error Reporting"],
    ["Yazılım Ortamı / Windows Hata Bildirimleri", "Software Environment / Windows Error Reporting"],
    ["Windows Hata Raporları", "Windows Error Reporting"],
    ["Windows Hata Raporlaması", "Windows Error Reporting"],
    ["Windows Hata Raporlama", "Windows Error Reporting"],
    ["Yazılım Ortamı / Windows Hata Raporlaması", "Software Environment / Windows Error Reporting"],
    ["Yazılım Ortamı / Windows Hata Raporlama", "Software Environment / Windows Error Reporting"],
    ["Windows Hata Bildirimleri", "Windows Error Reporting"],
    ["Yazılım Ortamı / Windows Hata Bildirimi", "Software Environment / Windows Error Reporting"],
    ["Windows Hata Bildirimi", "Windows Error Reporting"],
    ["Windows ile birlikte çalışmayı durdurdu ve kapatıldı", "stopped working with Windows and was closed"],
    ["Windows ile birlikte calismayi durdurdu ve kapatildi", "stopped working with Windows and was closed"],
    ["Hatalı paketle ilgili uygulama kimliği:", "Faulting package-relative application ID:"],
    ["Hatali paketle ilgili uygulama kimligi:", "Faulting package-relative application ID:"],
    ["Hatalı paket tam adı:", "Faulting package full name:"],
    ["Hatali paket tam adi:", "Faulting package full name:"],
    ["Uygulama başlangıç zamanı:", "Application start time:"],
    ["Uygulama baslangic zamani:", "Application start time:"],
    ["Hatalı uygulama yolu:", "Faulting application path:"],
    ["Hatali uygulama yolu:", "Faulting application path:"],
    ["Hatalı modül yolu:", "Faulting module path:"],
    ["Hatali modul yolu:", "Faulting module path:"],
    ["Hatalı işlem kimliği:", "Faulting process id:"],
    ["Hatali islem kimligi:", "Faulting process id:"],
    ["Hatalı uygulama adı:", "Faulting application name:"],
    ["Hatali uygulama adi:", "Faulting application name:"],
    ["Hatalı modül adı:", "Faulting module name:"],
    ["Hatali modul adi:", "Faulting module name:"],
    ["Özel durum kodu:", "Exception code:"],
    ["Ozel durum kodu:", "Exception code:"],
    ["zaman damgası:", "Time stamp:"],
    ["zaman damgasi:", "Time stamp:"],
    ["Hata uzaklığı:", "Fault offset:"],
    ["Hata uzakligi:", "Fault offset:"],
    ["Rapor kimliği:", "Report ID:"],
    ["Rapor kimligi:", "Report ID:"],
    ["Hata demeti", "Fault bucket"],
    ["Olay Adı:", "Event name:"],
    ["Olay adı:", "Event name:"],
    ["Olay Adı", "Event name"],
    ["Yanıt:", "Response:"],
    ["Yanit:", "Response:"],
    ["Kullanılamıyor", "Not available"],
    ["Kullanilamiyor", "Not available"],
    ["Uygulama Hatası", "Application Error"],
    ["Uygulama Hatasi", "Application Error"],
    ["Uygulama Askıda", "Application Hang"],
    ["Uygulama Askida", "Application Hang"],
    ["sürüm:", "version:"],
    ["surum:", "version:"],
    ["Sistem özeti", "System Summary"],
    ["Bileşenler", "Components"],
    ["Görüntü", "Display"],
    ["Grafikler", "Graphics"],
    ["Ağ", "Network"],
    ["Ağ bağdaştırıcıları", "Network Adapters"],
    ["İşletim Sistemi Adı", "OS Name"],
    ["İşletim Sistemi Sürümü", "OS Version"],
    ["Derleme", "Build"],
    ["İşletim Sistemi Derlemesi", "OS Build"],
    ["Sistem Türü", "System Type"],
    ["İşlemci", "Processor"],
    ["Saat Dilimi", "Time Zone"],
    ["Platform Rolü", "Platform Role"],
    ["Orijinal Kurulum Tarihi", "Original Install Date"],
    ["Yüklü Fiziksel Bellek (RAM)", "Installed Physical Memory (RAM)"],
    ["Yüklü Fiziksel Bellek", "Installed Physical Memory"],
    ["Toplam Fiziksel Bellek", "Total Physical Memory"],
    ["Kullanılabilir Fiziksel Bellek", "Available Physical Memory"],
    ["Toplam Sanal Bellek", "Total Virtual Memory"],
    ["Kullanılabilir Sanal Bellek", "Available Virtual Memory"],
    ["Sayfalama Dosyası", "Page File"],
    ["Sayfalama Dosyası Alanı", "Page File Space"],
    ["Sayfalama Dosyası Konumu", "Page File Location(s)"],
    ["Sayfalama Dosyası Konumları", "Page File Location(s)"],
    ["Dosya Sistemi", "File System"],
    ["Toplam Boyut", "Total Size"],
    ["Boş Alan", "Free Space"],
    ["Kullanılan Alan", "Used"],
    ["Sürücü Harfi", "Drive Letter"],
    ["Yerel Disk", "Local Disk"],
    ["Sabit Disk", "Local Fixed Disk"],
    ["Ağ Sürücüsü", "Network drive"],
    ["Çıkarılabilir Depolama", "Removable storage"],
    ["DVD Sürücüsü", "Optical drive"],
    ["Sürücü Sürümü", "Driver Version"],
    ["Sürücü Versiyonu", "Driver Version"],
    ["Sürücü Tarihi", "Driver Date"],
    ["Bağdaştırıcı Türü", "Adapter Type"],
    ["Bağdaştırıcı RAM", "Adapter RAM"],
    ["Tak ve Çalıştır Aygıt Kimliği", "PNP Device ID"],
    ["Çözünürlük", "Resolution"],
    ["Geçerli Çözünürlük", "Current Resolution"],
    ["Bağlantı Adı", "Connection Name"],
    ["Varsayılan Ağ Geçidi", "Default Gateway"],
    ["Alt Ağ Maskesi", "Subnet Mask"],
    ["Fiziksel Adres", "Physical Address"],
    ["Hız", "Speed"],
    ["Üretici", "Manufacturer"],
    ["Ürün", "Product"],
    ["Seri Numarası", "Serial Number"],
    ["Anakart", "Motherboard"],
    ["Kasa Türü", "Chassis Type"],
    ["Bilgisayar Sistemi Türü", "PC System Type"],
    ["Sistem Ailesi", "System Family"],
    ["Evet", "Yes"],
    ["Hayır", "No"],
    ["Çalışıyor", "Running"],
    ["Durduruldu", "Stopped"],
    ["Devre Dışı", "Disabled"],
    ["Otomatik", "Automatic"],
    ["Elle", "Manual"],
    ["Uyumlu", "compatible"],
    ["NVIDIA uyumlu", "NVIDIA-compatible"],
    ["Intel uyumlu", "Intel-compatible"],
    ["AMD uyumlu", "AMD-compatible"],
    ["x64 tabanlı bilgisayar", "x64-based PC"],
    ["x86 tabanlı bilgisayar", "x86-based PC"],
    ["ARM64 tabanlı bilgisayar", "ARM64-based PC"],
    ["Hata kapsayıcısı", "Error container"],
    ["Olay Adı:", "Event name:"],
    ["Yanıt: Veri yok", "Response: No data"],
    ["Veri yok", "No data"],
    ["Sorun İmzası:", "Problem signature:"],
    ["Ekli Dosyalar:", "Attached files:"],
    ["Dosya sistemi", "File System"],
    ["Toplam boyut", "Total Size"],
    ["Boş alan", "Free Space"],
    ["Kullanılamıyor", "Unavailable"],
    /** tr: Language Adder export (msımete.nfo, UTF-16 LE) — field labels + WinSock + storage; longer keys first. */
    [
      "Hiper yönetici algılandı. Hyper-V için gereken özellikler görüntülenmeyecek.",
      "A hypervisor has been detected. Features required for Hyper-V will not be displayed.",
    ],
    ["İş için Uygulama Denetimi kullanıcı modu ilkesi", "Windows Defender Application Control user mode policy"],
    ["İş için Uygulama Denetimi ilkesi", "Windows Defender Application Control policy"],
    ["Sanallaştırma tabanlı güvenlik Kullanılabilir Güvenlik Özellikleri", "Virtualization-based security Available Security Features"],
    ["Sanallaştırma tabanlı güvenlik Gerekli Güvenlik Özellikleri", "Virtualization-based security Required Security Features"],
    ["Sanallaştırma tabanlı güvenlik Yapılandırılmış Hizmetler", "Virtualization-based security Configured Services"],
    ["Sanallaştırma tabanlı güvenlik Çalışan Hizmetler", "Virtualization-based security Running Services"],
    ["Sanallaştırma tabanlı güvenlik", "Virtualization-based security"],
    ["Diğer İşletim Sistemi Açıklaması", "Other OS Description"],
    ["Disk Belleği Dosyası Alanı", "Page File Space"],
    ["Disk Belleği Dosyası", "Paging File"],
    ["Donanım Soyutlama Katmanı", "Hardware Abstraction Layer"],
    ["Ekli Denetleyici Sürümü", "Embedded Controller Version"],
    ["Güvenli Önyükleme Durumu", "Secure Boot State"],
    ["Kullanıcı Adı", "User Name"],
    ["Önyükleme Aygıtı", "Boot Device"],
    ["PCR7 Yapılandırması", "PCR7 Configuration"],
    ["Sistem Adı", "System Name"],
    ["SMBIOS Sürümü", "SMBIOS Version"],
    ["Temel Kart Sürümü", "BaseBoard Version"],
    ["BIOS Sürümü/Tarihi", "BIOS Version/Date"],
    ["BIOS Modu", "BIOS Mode"],
    ["DHCP Kiralama Başlangıcı", "DHCP Lease Obtained"],
    ["DHCP Kiralama Bitişi", "DHCP Lease Expires"],
    ["Hizmet Adı", "Service Name"],
    ["PNP Aygıt Kimliği", "PNP Device ID"],
    ["Son Sıfırlama", "Last Reset"],
    ["IRQ Kanalı", "IRQ Channel"],
    ["Bağlanma Verilerini Destekler", "Supports connect data"],
    ["Bağlantı Kesme Verilerini Destekler", "Supports disconnect data"],
    ["Bağlantısız Hizmet", "Connectionless service"],
    ["Çok Noktaya Yayını Destekler", "Supports multipoint"],
    ["Düzgün Kapatmayı Destekler", "Supports graceful close"],
    ["En Büyük Adres Boyutu", "Maximum Address Size"],
    ["En Büyük İleti Boyutu", "Maximum Message Size"],
    ["En Küçük Adres Boyutu", "Minimum Address Size"],
    ["Garantili Bant Genişliğini Destekler", "Supports Guaranteed Bandwidth"],
    ["Şifrelemeyi Destekler", "Supports encryption"],
    ["Sıralamayı Garanti Eder", "Guaranteed Sequencing"],
    ["Yayını Destekler", "Supports broadcast"],
    ["İletiye Dayalı", "Message Oriented"],
    ["Sahte Akışa Dayalı", "Pseudo Stream Oriented"],
    ["Bölüm Başlama Uzaklığı", "Partition Starting Offset"],
    ["Bölüm Boyutu", "Partition Size"],
    ["SCSI Bağlantı Noktası", "SCSI Port"],
    ["SCSI Hedef Kimliği", "SCSI Target ID"],
    ["SCSI Mantıksal Birimi", "SCSI Logical Unit"],
    ["Toplam İz", "Total Tracks"],
    ["Yüklü Medya", "Media Loaded"],
    ["Medya Türü", "Media Type"],
    ["Bölümler", "Partitions"],
    ["Kesim/İz", "Sectors/Track"],
    ["İz/Silindir", "Tracks/Cylinder"],
    ["Birim Adı", "Volume Name"],
    ["Sıkıştırılmış", "Compressed"],
    ["Çift Tıklatma Eşiği", "Double-Click Threshold"],
    ["Donanım Türü", "Hardware Type"],
    ["Düğme Sayısı", "Number of Buttons"],
    ["Güç Yönetimi Destekleniyor", "Power Management Supported"],
    ["Kullanılan El", "Hand"],
    ["İşlev Tuşu Sayısı", "Function Key Count"],
    ["Yerleşim", "Layout"],
    ["G/Ç Bağlantı Noktası", "I/O Port"],
    ["Bağdaştırıcı Açıklaması", "Adapter Description"],
    ["INF Dosyası", "INF File"],
    ["Renk Düzlemleri", "Color Planes"],
    ["Yüklü Sürücüler", "Installed Drivers"],
    ["İletişim Kuralları", "Protocols"],
    ["Bağdaştırıcı", "Adapter"],
    ["Ses Aygıtı", "Sound Device"],
    ["Depolama / Diskler", "Storage / Disks"],
    ["Depolama / SCSI", "Storage / SCSI"],
    ["Depolama / Sürücü", "Storage / Drive"],
    /** Common Turkish MSInfo column headers (Language Adder); longer keys already above (e.g. Kullanıcı Adı). */
    ["Açıklama", "Description"],
    ["Yüklü", "Installed"],
    ["Bölüm", "Partition"],
    ["Sürüm", "Version"],
    ["Adı", "Name"],
    ["Sürücü", "Driver"],
    ["Güç", "Power"],
    // --- Swedish (sv) ---
    ["Programmiljö", "Software Environment"],
    ["Systemöversikt", "System Summary"],
    ["Maskinvaruresurser", "Hardware Resources"],
    ["Komponenter", "Components"],
    ["Bildskärm", "Display"],
    ["Grafikkort", "Display"],
    ["Operativsystemets namn", "OS Name"],
    ["Operativsystemversion", "OS Version"],
    ["Drivrutinsversion", "Driver Version"],
    ["Installerat fysiskt minne (RAM)", "Installed Physical Memory (RAM)"],
    ["Installerat fysiskt minne", "Installed Physical Memory"],
    ["Totalt fysiskt minne", "Total Physical Memory"],
    ["Tillgängligt fysiskt minne", "Available Physical Memory"],
    ["Totalt virtuellt minne", "Total Virtual Memory"],
    ["Tillgängligt virtuellt minne", "Available Virtual Memory"],
    ["Växlingsfil", "Page File"],
    ["Pagineringssökväg", "Page File Location(s)"],
    ["Namn", "Name"],
    ["Upplösning", "Resolution"],
    ["Nuvarande upplösning", "Current Resolution"],
    ["Tidszon", "Time Zone"],
    ["Plattformsroll", "Platform Role"],
    ["Processorn", "Processor"],
    ["Systemtyp", "System Type"],
    ["Datortyp", "System Type"],
    ["Ursprungligt installationsdatum", "Original Install Date"],
    ["BIOS-version/datum", "BIOS Version/Date"],
    ["Plug and Play-enhets-ID", "PNP Device ID"],
    ["Västeuropa, normaltid", "W. Europe Standard Time"],
    ["Stationär dator", "Desktop"],
    ["Bärbar dator", "Laptop"],
    ["x64-baserad dator", "x64-based PC"],
    ["x86-baserad dator", "x86-based PC"],
    ["ARM64-baserad dator", "ARM64-based PC"],
    ["8 kärnor, 16 logiska processorer", "8 cores, 16 logical processors"],
    ["logiska processorer", "logical processors"],
    ["kärnor", "cores"],
    ["Programmiljö / Windows felrapportering", "Software Environment / Windows Error Reporting"],
    ["Programmiljö / Windows felrapporteringar", "Software Environment / Windows Error Reporting"],
    ["Windows felrapportering", "Windows Error Reporting"],
    ["Windows-felrapportering", "Windows Error Reporting"],
    ["Felrapportering", "Error reporting"],
    ["Fel på programnamn", "Faulting application name"],
    ["Fel-bucket", "Fault bucket"],
    ["Händelsenamn", "Event name"],
    ["Svar: Inte tillgänglig", "Response: Not available"],
    ["Inte tillgänglig", "Not available"],
    /** Swedish WER / fault strings (embedded in Information column). Longer keys first. */
    ["Felprocess för starttid för program", "Faulting process start time"],
    ["Fullständigt namn på standardpaket", "Full package name"],
    ["Felpaketrelativt program-ID", "Faulting package-relative application ID"],
    ["Felsökväg för program", "Faulting application path"],
    ["Modulsökväg för fel", "Faulting module path"],
    ["Felprocess-ID:", "Faulting process id:"],
    ["Felprocess-ID", "Faulting process id"],
    ["Felförskjutning:", "Fault offset:"],
    ["Felförskjutning", "Fault offset"],
    ["Undantagskod:", "Exception code:"],
    ["Undantagskod", "Exception code"],
    ["tidsstämpel:", "time stamp:"],
    ["tidsstämpel", "time stamp"],
    ["Rapport-ID:", "Report ID:"],
    ["Rapport-ID", "Report ID"],
    /** Swedish network adapter fields (extra rows not merged into English aliases). */
    ["DHCP-lånet upphör", "DHCP Lease Expires"],
    ["DHCP-lånet erhölls", "DHCP Lease Obtained"],
    ["Minnesadress", "Memory Address"],
    ["IRQ-kanal", "IRQ Channel"],
    ["Drivrutin", "Driver"],
    /** Swedish WER extended labels (Problem Details / bucket text). */
    ["Filerna kan vara tillgängliga här:", "These files might be available here:"],
    ["Dessa filer finns här:", "These files can be found here:"],
    ["Bifogade filer:", "Attached files:"],
    ["Analyssymbol:", "Analysis symbol:"],
    ["Kontrollerar lösning igen:", "Checking for solutions again:"],
    ["Rapportstatus:", "Report status:"],
    ["Gehashad behållare:", "Hashed container:"],
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
    ["Résumé système", "System Summary"],
    ["Fuseaux horaires", "Time Zone"],
    ["Environnement logiciel / Rapports d'erreurs Windows", "Software Environment / Windows Error Reporting"],
    ["Environnement logiciel / Rapports d’erreurs Windows", "Software Environment / Windows Error Reporting"],
    ["Environnement logiciel / Rapport d'erreurs Windows", "Software Environment / Windows Error Reporting"],
    ["Environnement logiciel / Rapport d’erreurs Windows", "Software Environment / Windows Error Reporting"],
    ["Rapports d'erreurs Windows", "Windows Error Reporting"],
    ["Rapports d’erreurs Windows", "Windows Error Reporting"],
    ["Rapport d'erreurs Windows", "Windows Error Reporting"],
    ["Rapport d’erreurs Windows", "Windows Error Reporting"],
    ["Conteneur d'erreurs", "Error container"],
    ["Nom de l'événement:", "Event name:"],
    ["Nom de l'événement", "Event name"],
    ["Nom d’événement:", "Event name:"],
    ["Nom d’événement", "Event name"],
    ["Nom d\u2019événement:", "Event name:"],
    ["Nom d\u2019événement", "Event name"],
    ["Réponse : Aucune donnée", "Response: No data"],
    ["Réponse : aucune donnée", "Response: No data"],
    /** fr-FR WER exports sometimes already contain English “Not available”. Normalize to our UI wording. */
    ["Réponse : Not available", "Response: Unavailable"],
    ["Réponse : Not Available", "Response: Unavailable"],
    ["Réponse:", "Response:"],
    ["Aucune donnée", "No data"],
    /** French WER sometimes uses this synonym for the bucket/container id. */
    ["Détecteur d'erreurs", "Error bucket"],
    ["Détecteur d’erreurs", "Error bucket"],
    ["ID CAB :", "CAB ID:"],
    ["ID CAB:", "CAB ID:"],
    ["Signature du problème :", "Problem signature:"],
    ["Signature du problème", "Problem signature"],
    ["Fichiers joints :", "Attached files:"],
    ["Fichiers joints", "Attached files"],
    ["Ces fichiers peuvent être disponibles ici :", "These files can be found here:"],
    ["Ces fichiers peuvent être disponibles ici:", "These files can be found here:"],
    ["Ces fichiers peuvent être disponibles ici\u00a0:", "These files can be found here:"],
    ["Ces fichiers sont peut-être disponibles ici :", "These files can be found here:"],
    ["Ces fichiers sont peut-être disponibles ici:", "These files can be found here:"],
    ["Symbole d'analyse :", "Analysis symbol:"],
    ["Symbole d'analyse", "Analysis symbol"],
    ["Symbole d’analyse :", "Analysis symbol:"],
    ["Symbole d’analyse", "Analysis symbol"],
    ["Nouvelle recherche de solutions :", "Searching for solutions:"],
    ["Conteneur haché :", "Hashed container:"],
    ["Identificateur du rapport :", "Report identifier:"],
    ["État du rapport :", "Report state:"],
    /** French WER label variants (seen in some MSInfo/WER exports). */
    ["Nouvelle recherche de la solution :", "Searching for solutions:"],
    ["Nouvelle recherche de la solution", "Searching for solutions:"],
    ["ID de rapport :", "Report ID:"],
    ["ID de rapport", "Report ID:"],
    ["Statut du rapport :", "Report status:"],
    ["Statut du rapport", "Report status:"],
    ["Récipient avec hachage :", "Hashed container:"],
    ["Récipient avec hachage", "Hashed container:"],
    ["Recipient avec hachage :", "Hashed container:"],
    ["Recipient avec hachage", "Hashed container:"],
    [", type ", ", type "],
    ["Ordinateur à processeur x64", "x64-based PC"],
    ["Ordinateur à processeur x86", "x86-based PC"],
    ["PC à base de x64", "x64-based PC"],
    ["PC à base de x86", "x86-based PC"],
    ["Mémoire physique installée (RAM)", "Installed Physical Memory (RAM)"],
    ["Mémoire physique (RAM) installée", "Installed Physical Memory (RAM)"],
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
    ["Modèle", "Model"],
    ["Processeur", "Processor"],
    ["Type du système", "System Type"],
    ["Rôle de la plateforme", "Platform Role"],
    ["Fuseau horaire", "Time Zone"],
    ["Catégorie d'appareil", "Device Category"],
    ["Fabricant", "Manufacturer"],
    ["État", "Status"],
    ["Exécution", "Running"],
    ["Arrêté", "Stopped"],
    ["En cours d'exécution", "Running"],
    ["En cours d\u2019exécution", "Running"],
    ["En cours d’exécution", "Running"],
    ["Désactivé", "Disabled"],
    ["Automatique", "Automatic"],
    ["Oui", "Yes"],
    ["Non", "No"],
    ["Indisponible", "Unavailable"],
    /** Keep UI wording consistent when the export contains English. */
    ["Not available", "Unavailable"],
    ["Not Available", "Unavailable"],
    ["NVIDIA-compatible", "NVIDIA-compatible"],
    /** French Windows editions (OS Name line). */
    ["Professionnel", "Professional"],
    ["Entreprise", "Enterprise"],
    ["Éducation", "Education"],
    ["Education", "Education"],
    ["Famille", "Home"],
    /** fr-FR “Locale” (Input / regional) row; apostrophe is often the Unicode U+2019 form. */
    ["Option régionale", "Locale"],
    /** French network adapter detail keys (MSInfo: Components → Network → Adapter). */
    ["Type de carte", "Card type"],
    ["Type du produit", "Product type"],
    ["Type de produit", "Product type"],
    ["Installé", "Installed"],
    ["Dernière réinitialisation", "Last Reset"],
    ["Nom du service", "Service Name"],
    ["Sous-réseau IP", "IP Subnet"],
    ["Sous-réseau IPv4", "IPv4 Subnet Mask"],
    ["Passerelle IP par défaut", "Default Gateway"],
    ["Passerelle IPv4 par défaut", "IPv4 Default Gateway"],
    ["DHCP activé", "DHCP enabled"],
    ["Serveur DHCP", "DHCP server"],
    ["Expiration du bail DHCP", "DHCP Lease Expires"],
    ["Obtention du bail DHCP", "DHCP Lease Obtained"],
    ["Adresse MAC", "MAC Address"],
    ["Port d’E/S", "I/O Port"],
    ["Port d'E/S", "I/O Port"],
    ["Adresse mémoire", "Memory address"],
    ["Pilote", "Driver"],
    /** French byte units that appear in GPU/network rows. */
    [" octets", " bytes"],
    [" octet", " bytes"],
    /** Additional French MSInfo field labels (from Language Adder exports). */
    ["Autre description du système d’exploitation", "Other OS Description"],
    ["Couche d’abstraction matérielle", "Hardware Abstraction Layer"],
    ["Espace pour le fichier d’échange", "Page File Space"],
    ["État du démarrage sécurisé", "Secure Boot State"],
    ["Fichier d’échange", "Page File"],
    ["Nom du système d’exploitation", "OS Name"],
    ["Périphérique de démarrage", "Boot Device"],
    ["Propriétés de sécurité disponibles pour la sécurité basée sur la virtualisation", "Virtualization-based security Available Security Properties"],
    ["Propriétés de sécurité requises pour la sécurité basée sur la virtualisation", "Virtualization-based security Required Security Properties"],
    ["Référence (SKU) du système", "System SKU"],
    ["Répertoire système", "System Directory"],
    ["Répertoire Windows", "Windows Directory"],
    ["Sécurité basée sur la virtualisation", "Virtualization-based security"],
    ["Services configurés pour la sécurité basée sur la virtualisation", "Virtualization-based security Services Configured"],
    ["Services en cours d’exécution pour la sécurité basée sur la virtualisation", "Virtualization-based security Services Running"],
    ["Stratégie Contrôle des applications pour entreprise", "Enterprise App Control Policy"],
    ["Stratégie du mode utilisateur de contrôle d’application pour entreprise", "Enterprise App Control User Mode Policy"],
    [
      "Un hyperviseur a été détecté. Les fonctionnalités nécessaires à Hyper-V ne seront pas affichées.",
      "A hypervisor has been detected. Features required for Hyper-V will not be displayed.",
    ],
    ["Version du contrôleur embarqué", "Embedded Controller Version"],
    ["Entrées de table des couleurs", "Color Table Entries"],
    ["ID de périphérique Plug-and-Play", "PNP Device ID"],
    ["ID du périphérique Plug-and-Play", "PNP Device ID"],
    ["Mémoire vive sur la carte", "Adapter RAM"],
    ["Résolution", "Resolution"],
    ["Type de matériel", "Hardware Type"],
    /** Serial port flags (Components → Ports → Serial). */
    ["Abandonner la lecture/l’écriture en cas d’erreur", "Abort read/write on error"],
    ["Bits d’arrêt", "Stop Bits"],
    ["Bits d’arrêt définissable", "Stop Bits Settable"],
    ["Bits de données définissables", "Data Bits Settable"],
    ["Caractère d’événement", "Event Character"],
    ["Caractère de fin de fichier (EOF)", "EOF Character"],
    ["Caractère de remplacement en cas d’erreur", "Error Replacement Character"],
    ["Caractère XOff", "XOFF Character"],
    ["Caractère XOn", "XON Character"],
    ["Contrôle de flux définissable", "Flow Control Settable"],
    ["Contrôle de flux entrant XOnXOff", "XON/XOFF In Flow"],
    ["Contrôle de flux sortant", "Out Flow Control"],
    ["Contrôle de flux sortant CTS", "CTS Out Flow"],
    ["Contrôle de flux sortant XOnXOff", "XON/XOFF Out Flow"],
    ["Contrôle de parité définissable", "Parity Settable"],
    ["Mode binaire activé", "Binary Mode Enabled"],
    ["Occupé", "Busy"],
    ["Parité", "Parity"],
    ["Prise en charge des caractères spéciaux", "Special Characters Supported"],
    ["Remplacement en cas d’erreur activé", "Error Replacement Enabled"],
    ["RLSD définissable", "RLSD Settable"],
    ["Sensibilité DSR", "DSR Sensitivity"],
    ["Taille maximale de la mémoire tampon d’entrée", "Maximum Input Buffer Size"],
    ["Taille maximale de la mémoire tampon de sortie", "Maximum Output Buffer Size"],
    ["Type de contrôle de flux DTR", "DTR Flow Control Type"],
    ["Type de contrôle de flux RTS", "RTS Flow Control Type"],
    ["Vérification de parité activée", "Parity Check Enabled"],
    ["Vitesse en bauds définissable", "Baud Rate Settable"],
    /** Network protocol capability flags (Components → Network → Protocol). */
    ["Garantie de séquence", "Guaranteed Sequencing"],
    ["Orienté message", "Message Oriented"],
    ["Orienté pseudo-stream", "Pseudo Stream Oriented"],
    ["Prise en charge d’arrêt approprié", "Supports graceful close"],
    ["Prise en charge des données de connexion", "Supports connect data"],
    ["Prise en charge des données de déconnexion", "Supports disconnect data"],
    ["Prise en charge des données expédiées", "Supports expedited data"],
    /** Storage labels. */
    ["Offset de démarrage de la partition", "Partition Starting Offset"],
    ["Capacité", "Capacity"],
    ["Média chargé", "Media Loaded"],
    ["Type de média", "Media Type"],
    ["Unité logique SCSI", "SCSI Logical Unit"],
    ["Compressé", "Compressed"],
    /** Common French Windows service display names (Services section). */
    ["Appel de procédure distante (RPC)", "Remote Procedure Call (RPC)"],
    ["Client de stratégie de groupe", "Group Policy Client"],
    ["Client de suivi de lien distribué", "Distributed Link Tracking Client"],
    ["Consommation des données", "Data Usage"],
    ["Découverte SSDP", "SSDP Discovery"],
    ["Détection matériel noyau", "Kernel Hardware Detection"],
    ["Expériences des utilisateurs connectés et télémétrie", "Connected User Experiences and Telemetry"],
    ["Générateur de points de terminaison du service Audio Windows", "Windows Audio Endpoint Builder"],
    ["Gestionnaire de comptes de sécurité", "Security Accounts Manager"],
    ["Gestionnaire des connexions d’accès à distance", "Remote Access Connection Manager"],
    ["Identité de l’application", "Application Identity"],
    ["Isolation de clé CNG", "CNG Key Isolation"],
    ["Journal d’événements Windows", "Windows Event Log"],
    ["Planificateur de tâches", "Task Scheduler"],
    ["Service Broker de découverte en arrière-plan DevQuery", "DevQuery Background Discovery Broker"],
    ["Service Broker des événements système", "System Events Broker"],
    ["Service Broker pour les connexions réseau", "Network Connection Broker"],
    ["Service Broker pour les événements horaires", "Time Broker"],
    ["Service d’association de périphérique", "Device Association Service"],
    ["Service d'hôte HV", "HV Host Service"],
    ["Service d’infrastructure des tâches en arrière-plan", "Background Tasks Infrastructure Service"],
    ["Service d’inspection réseau de l’antivirus Microsoft Defender", "Microsoft Defender Antivirus Network Inspection Service"],
    ["Service de configuration du périphérique d’impression", "Print Device Configuration Service"],
    [
      "Service de découverte automatique de Proxy Web pour les services HTTP Windows",
      "WinHTTP Web Proxy Auto-Discovery Service",
    ],
    ["Service de déploiement AppX (AppXSVC)", "AppX Deployment Service (AppXSVC)"],
    ["Service de géolocalisation", "Geolocation Service"],
    ["Service de gestion des entrées de texte", "Touch Keyboard and Handwriting Panel Service"],
    ["Service de l’Assistant Compatibilité des programmes", "Program Compatibility Assistant Service"],
    ["Service de notification d’événements système", "System Event Notification Service"],
    ["Service de plateforme des appareils connectés", "Connected Devices Platform Service"],
    ["Service de stratégie d'affichage", "Display Policy Service"],
    ["Service de stratégie de diagnostic", "Diagnostic Policy Service"],
    ["Service de transfert intelligent en arrière-plan", "Background Intelligent Transfer Service"],
    ["Service du périphérique d’interface utilisateur", "Human Interface Device Service"],
    ["Service du système de notifications Push Windows", "Windows Push Notifications System Service"],
    ["Service Énumérateur d’appareil mobile", "Mobile Device Enumerator Service"],
    ["Service Gestionnaire d’accès aux fonctionnalités", "Capability Access Manager Service"],
    ["Service Interface du magasin réseau", "Network Store Interface Service"],
    ["Service Liste des réseaux", "Network List Service"],
    ["Service Orchestrator pour les mises à jour", "Update Orchestrator Service"],
    ["Service Sécurité Windows", "Windows Security Service"],
    ["Système d’événement COM+", "COM+ Event System"],
    ["Thèmes", "Themes"],
    ["Agent de stratégie IPsec", "IPsec Policy Agent"],
    ["Application système COM+", "COM+ System Application"],
    ["Assistant Connectivité réseau", "Network Connectivity Assistant"],
    ["Carte à puce", "Smart Card"],
    ["Centre de sécurité", "Security Center"],
    ["Centre local de distribution de clés Kerberos", "Kerberos Local Key Distribution Center"],
    ["Cliché instantané des volumes", "Volume Shadow Copy"],
    ["Collecteur d’événements de Windows", "Windows Event Collector"],
    ["Configuration automatique de réseau câblé", "Wired AutoConfig"],
    ["Configuration automatique des périphériques connectés au réseau", "Network Connected Devices Auto-Setup"],
    ["Connaissance des emplacements réseau", "Network Location Awareness"],
    ["Connexions réseau", "Network Connections"],
    ["Contrôle parental", "Parental Controls"],
    ["Coordinateur de transactions distribuées", "Distributed Transaction Coordinator"],
    ["Événements d’acquisition d’images fixes", "Still Image Acquisition Events"],
    ["Expérience audio-vidéo haute qualité Windows", "Windows High Quality Audio Video Experience"],
    ["Fournisseur de cliché instantané de logiciel Microsoft", "Microsoft Software Shadow Copy Provider"],
    ["Gestion à distance de Windows (Gestion WSM)", "Windows Remote Management (WS-Management)"],
    ["Gestionnaire d’installation de périphérique", "Device Install Service"],
    ["Gestionnaire des cartes téléchargées", "Downloaded Maps Manager"],
    ["Gestionnaire des connexions automatiques d’accès à distance", "Remote Access Auto Connection Manager"],
    ["Hôte de DLL de compteur de performance", "Performance Counter DLL Host"],
    ["Hôte de périphérique UPnP", "UPnP Device Host"],
    ["Hôte du fournisseur de découverte de fonctions", "Function Discovery Provider Host"],
    ["Hôte système de diagnostics", "Diagnostic System Host"],
    ["Gestionnaires des paiements et des éléments sécurisés NFC", "NFC Secure Elements and Payments Manager"],
    ["Informations sur l’utilisation et la qualité de Microsoft", "Microsoft Usage and Quality Data"],
    ["Intégrité de Windows et expériences optimisées", "Windows Health and Optimized Experiences"],
    ["Prise en charge du Panneau de configuration Rapports de problèmes", "Problem Reports and Control Panel Support"],
    ["Service d’identité de Microsoft Cloud", "Microsoft Cloud Identity Service"],
    ["Service d'inscription de la gestion des périphériques", "Device Management Enrollment Service"],
    ["Service de configuration (DC) déclaré", "Declared Configuration (DC) Service"],
    ["Service de partage des données", "Data Sharing Service"],
    ["Service de plateforme de données agrégées", "Aggregated Data Platform Service"],
    ["Interface de services d’invité Hyper-V", "Hyper-V Guest Service Interface"],
    ["Jeu sauvegardé sur Xbox Live", "Xbox Live Game Save"],
    ["Localisateur d’appels de procédure distante (RPC)", "Remote Procedure Call (RPC) Locator"],
    ["Mappage de découverte de topologie de la couche de liaison", "Link-Layer Topology Discovery Mapper"],
    ["Mode incorporé", "Embedded Mode"],
    ["Modules de génération de clés IKE et AuthIP", "IKE and AuthIP IPsec Keying Modules"],
    ["Moniteur de serveur de trame Caméra Windows", "Windows Camera Frame Server Monitor"],
    ["Préparation des applications", "App Readiness"],
    ["Programme de mise à jour automatique du fuseau horaire", "Auto Time Zone Updater"],
    ["Publication des ressources de découverte de fonctions", "Function Discovery Resource Publication"],
    ["Registre à distance", "Remote Registry"],
    ["Requête du service VSS Hyper-V", "Hyper-V Volume Shadow Copy Requestor"],
    ["Routage et accès distant", "Routing and Remote Access"],
    ["Serveur de trame de la Caméra Windows", "Windows Camera Frame Server"],
    ["Service Arrêt de l’invité Microsoft Hyper-V", "Hyper-V Guest Shutdown Service"],
    ["Service d'amélioration de l'affichage", "Display Enhancement Service"],
    ["Service d’Appraisal inventaire et compatibilité", "Inventory and Compatibility Appraisal Service"],
    ["Service d’énumération de périphériques de carte à puce", "Smart Card Device Enumeration Service"],
    ["Service d'expérience linguistique", "Language Experience Service"],
    ["Service d’inscription de la gestion des périphériques", "Device Management Enrollment Service"],
    ["Service d’installation de périphérique", "Device Setup Manager"],
    ["Service de biométrie Windows", "Windows Biometric Service"],
    ["Service de déduplication ReFS", "ReFS Deduplication Service"],
    ["Service de démo du magasin", "Retail Demo Service"],
    ["Service de gestion de la connectivité mobile", "Mobile Connectivity Service"],
    ["Service de mise en réseau Xbox Live", "Xbox Live Networking Service"],
    ["Service de partage réseau du Lecteur multimédia Windows", "Windows Media Player Network Sharing Service"],
    ["Service de résolution des problèmes recommandé", "Recommended Troubleshooting Service"],
    ["Service Données de capteur", "Sensor Data Service"],
    ["Service Échange de données Microsoft Hyper-V", "Hyper-V Data Exchange Service"],
    ["Service hôte du fournisseur de chiffrement Windows", "Windows Encryption Provider Host Service"],
    ["Service hôte WDIServiceHost", "WDIServiceHost"],
    ["Service Point d'accès sans fil mobile Windows", "Windows Mobile Hotspot Service"],
    ["Service proxy de périphérique audio virtuel Windows", "Windows Virtual Audio Device Proxy Service"],
    ["Service téléphonique", "Phone Service"],
    ["Stratégie de retrait de la carte à puce", "Smart Card Removal Policy"],
    ["Téléphonie", "Telephony"],
    ["Vérificateur de points", "Spot Verifier"],
    /** Instance-scoped per-user services (keep the suffix). */
    ["Accès aux données utilisateur_74591", "User Data Access_74591"],
    ["Données de contacts_74591", "Contact Data_74591"],
    ["Hôte de synchronisation_74591", "Sync Host_74591"],
    ["Service pour utilisateur de plateforme d’appareils connectés_74591", "Connected Devices Platform User Service_74591"],
    ["Service utilisateur du kit de développement sans station d’accueil_74591", "User Service (Dockless Dev Kit)_74591"],
    ["Stockage des données utilisateur_74591", "User Data Storage_74591"],
    /** Third-party services. */
    ["Service de mise à jour Google (GoogleUpdaterService148.0.7730.0)", "Google Update Service (GoogleUpdaterService148.0.7730.0)"],
    [
      "Service interne de mise à jour Google (GoogleUpdaterInternalService148.0.7730.0)",
      "Google Update Internal Service (GoogleUpdaterInternalService148.0.7730.0)",
    ],
    // --- Spanish (es) ---
    ["Resumen del sistema", "System Summary"],
    ["Nombre del SO", "OS Name"],
    ["Versión del sistema operativo", "Operating System Version"],
    ["Versión", "Version"],
    ["Compilación del SO", "OS Build"],
    ["Compilación de Windows", "Windows Build"],
    ["compilación", "build"],
    ["Compilación", "Build"],
    ["Directorio de Windows", "Windows Directory"],
    ["Fabricante del sistema", "System Manufacturer"],
    ["Fabricante del SO", "OS Manufacturer"],
    ["Nombre de host", "Host Name"],
    ["Nombre del dispositivo", "Device Name"],
    ["Id. del producto", "Product ID"],
    ["Id. original del producto", "Original Product ID"],
    ["Fecha de instalación original", "Original Install Date"],
    ["Zona horaria", "Time Zone"],
    ["Estado de arranque seguro", "Secure Boot State"],
    ["Configuración regional", "Locale"],
    ["Lista de idiomas", "Input languages"],
    /** Do not map bare {@code Hora}/{@code Tipo}/{@code Detalles} — they corrupt Spanish time-zone names (“Hora estándar …”). */
    ["Entorno de software / Informes de errores de Windows", "Software Environment / Windows Error Reporting"],
    ["Entorno de software / Informe de errores de Windows", "Software Environment / Windows Error Reporting"],
    ["Informes de errores de Windows", "Windows Error Reporting"],
    ["Informe de errores de Windows", "Windows Error Reporting"],
    ["Depósito con errores", "Error bucket"],
    ["Identificador de archivo .cab", "CAB file identifier"],
    ["Subred IP", "IP Subnet"],
    ["Puerta de enlace IP predeterminada", "Default IP Gateway"],
    ["Expiración de la concesión DHCP", "DHCP Lease Expires"],
    ["Concesión DHCP obtenida", "DHCP Lease Obtained"],
    ["Restablecido por última vez", "Last Reset"],
    ["Nombre de servicio", "Service Name"],
    ["Id. de dispositivo PNP", "PNP Device ID"],
    ["Dirección MAC", "MAC Address"],
    ["Dirección de memoria", "Memory Address"],
    ["Controlador", "Driver"],
    ["Dirección IP", "IP Address"],
    ["Contenedor de errores", "Error container"],
    ["Nombre del evento:", "Event name:"],
    ["Nombre del evento", "Event name"],
    /** Common es-ES WER wording uses {@code de} (“Nombre de evento”) — distinct from {@code del} above. */
    ["Es posible que estos archivos estén disponibles aquí:", "These files may be available here:"],
    ["Verificando nuevamente si hay una solución:", "Searching for solutions:"],
    ["Nueva búsqueda de una solución:", "Searching for solutions:"],
    ["Búsqueda nueva de una solución:", "Searching for solutions:"],
    ["Depósito con algoritmo hash:", "Hashed container:"],
    ["Nombre de evento:", "Event name:"],
    ["Nombre de evento", "Event name"],
    ["Id. de informe:", "Report identifier:"],
    ["Respuesta: No hay datos", "Response: No data"],
    ["Respuesta:", "Response:"],
    ["No hay datos", "No data"],
    /** es-ES WER uses “GUID” label; {@link LOCALE_PAIRS_MSINFO_INTL} already has {@code Identificador de archivo .cab}. */
    ["GUID de archivo .cab:", "CAB file GUID:"],
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
    ["PC basado en x64", "x64-based PC"],
    ["PC basado en x86", "x86-based PC"],
    ["PC basado en ARM64", "ARM64-based PC"],
    ["procesadores lógicos", "logical processors"],
    ["procesadores logicos", "logical processors"],
    ["procesadores principales", "physical processors"],
    ["Hora estándar romance", "Romance Standard Time"],
    ["Hora de verano romance", "Romance Daylight Time"],
    ["Hora estándar centroeuropea", "Central European Standard Time"],
    ["Hora estándar del Pacífico", "Pacific Standard Time"],
    ["Hora estándar oriental", "Eastern Standard Time"],
    ["Rol de la plataforma", "Platform Role"],
    ["Rol de plataforma", "Platform Role"],
    ["Tipo de sistema", "System Type"],
    ["Procesador", "Processor"],
    ["Clasificación", "Classification"],
    ["Clasificacion", "Classification"],
    ["Memoria virtual total", "Total Virtual Memory"],
    ["Memoria virtual disponible", "Available Virtual Memory"],
    ["Espacio del archivo de paginación", "Page File Space"],
    ["Espacio del archivo de paginacion", "Page File Space"],
    ["Ubicación del archivo de paginación", "Page File Location(s)"],
    ["Ubicacion del archivo de paginacion", "Page File Location(s)"],
    ["Número de serie", "Serial Number"],
    ["Numero de serie", "Serial Number"],
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
    /** Spanish Services list state (Windows uses “Activo” / “Detenido”, not “En ejecución”). */
    ["Activo", "Running"],
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
    ["Esses arquivos talvez estejam disponíveis em:", "These files may be available at:"],
    ["Esses arquivos podem estar disponíveis aqui:", "These files can be found here:"],
    ["Verificando novamente se há uma solução:", "Searching for solutions:"],
    ["Símbolo da análise:", "Analysis symbol:"],
    ["Símbolo de análise:", "Analysis symbol:"],
    ["Status do Relatório:", "Report status:"],
    ["ID do Relatório:", "Report ID:"],
    ["Bucket com hash:", "Hashed container:"],
    ["Guid do CAB:", "CAB ID:"],
    ["GUID do CAB:", "CAB ID:"],
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
    ["Em Execução", "Running"],
    ["Parado", "Stopped"],
    ["Desativado", "Disabled"],
    ["Desabilitado", "Disabled"],
    ["Desactivado", "Disabled"],
    ["Automático", "Automatic"],
    ["Automatico", "Automatic"],
    ["Sim", "Yes"],
    ["Não", "No"],
    ["Resumo do sistema", "System Summary"],
    ["Nome do sistema operacional", "OS Name"],
    ["Nome do Sistema Operacional", "OS Name"],
    ["Versão do sistema operacional", "Operating System Version"],
    ["Versão", "Version"],
    ["Compilação do SO", "OS Build"],
    ["Compilação de Windows", "Windows Build"],
    ["Compilação", "Build"],
    ["Função da Plataforma", "Platform Role"],
    ["Função da plataforma", "Platform Role"],
    ["Área de Trabalho", "Desktop"],
    ["Area de Trabalho", "Desktop"],
    ["Tipo do sistema", "System Type"],
    ["Fabricante do sistema", "System Manufacturer"],
    ["Nome do sistema", "System Name"],
    ["Modelo do sistema", "System Model"],
    ["Sistema de arquivos", "File System"],
    ["Memória Física (RAM) Instalada", "Installed Physical Memory (RAM)"],
    ["Memória física (RAM) instalada", "Installed Physical Memory (RAM)"],
    ["Hora oficial do Brasil", "Brazil Standard Time"],
    ["Computador baseado em x86", "x86-based PC"],
    ["Computador baseado em ARM64", "ARM64-based PC"],
    ["Serviços", "Services"],
    ["Fabricante da BaseBoard", "BaseBoard Manufacturer"],
    ["Produto BaseBoard", "BaseBoard Product"],
    ["Versão da BaseBoard", "BaseBoard Version"],
    ["Processador", "Processor"],
    ["Fuso horário", "Time Zone"],
    ["Localidade", "Locale"],
    ["Memória física disponível", "Available Physical Memory"],
    ["Memória física total", "Total Physical Memory"],
    ["Memória virtual disponível", "Available Virtual Memory"],
    ["Memória virtual total", "Total Virtual Memory"],
    ["Memória RAM do adaptador", "Adapter RAM"],
    ["Descrição do adaptador", "Adapter Description"],
    ["Resolução", "Resolution"],
    ["Versão/data do BIOS", "BIOS Version/Date"],
    ["Modo da BIOS", "BIOS Mode"],
    ["Estado da Inicialização Segura", "Secure Boot State"],
    ["Configuração PCR7", "PCR7 Configuration"],
    ["Pasta do Windows", "Windows Directory"],
    ["Pasta do sistema", "System Directory"],
    ["Dispositivo de inicialização", "Boot Device"],
    ["Nome de usuário", "User Name"],
    ["Camada de Abstração de Hardware", "Hardware Abstraction Layer"],
    ["Espaço do arquivo de paginação", "Page File Space"],
    ["Arquivo de paginação", "Page File"],
    ["Proteção de DMA de Kernel", "Kernel DMA Protection"],
    ["Outra Descrição do Sistema Operacional", "Other OS Description"],
    ["Fabricante do Sistema Operacional", "OS Manufacturer"],
    ["SKU do sistema", "System SKU"],
    ["Versão do SMBIOS", "SMBIOS Version"],
    ["Versão do Controlador Incorporado", "Embedded Controller Version"],
    ["Segurança baseada em virtualização", "Virtualization-based security"],
    [
      "Propriedades de Segurança Disponíveis da segurança baseada em virtualização",
      "Virtualization-based security Available Security Properties",
    ],
    [
      "Propriedades de Segurança Obrigatórias da segurança baseada em virtualização",
      "Virtualization-based security Required Security Properties",
    ],
    [
      "Um hipervisor foi detectado. Recursos necessários para o Hyper-V não serão exibidos.",
      "A hypervisor has been detected. Features required for Hyper-V will not be displayed.",
    ],
    ["Suporte à Criptografia de Dispositivo Automática", "Automatic device encryption support"],
    ["Política de Controle de Aplicativos para Empresas", "Enterprise Application Control policy"],
    [
      "Política de modo de usuário do Controle de Aplicativos para Empresas",
      "Enterprise Application Control user mode policy",
    ],
    /** pt-BR Windows Error Reporting — Application Error / fault bucket lines (WER XML text). Longer keys first. */
    ["ID do aplicativo relativo ao pacote com falha:", "Faulting package-relative application ID:"],
    ["Nome completo do pacote com falha:", "Faulting package full name:"],
    ["Hora de início do aplicativo com falha:", "Faulting application start time:"],
    ["Caminho do aplicativo com falha:", "Faulting application path:"],
    ["Caminho do módulo com falha:", "Faulting module path:"],
    ["Nome do aplicativo com falha:", "Faulting application name:"],
    ["Nome do módulo com falha:", "Faulting module name:"],
    ["ID do processo com falha:", "Faulting process id:"],
    ["Deslocamento de falha:", "Fault offset:"],
    ["Código de exceção:", "Exception code:"],
    ["carimbo de data/hora:", "Time stamp:"],
    ["versão:", "version:"],
    ["Versão:", "Version:"],
    ["ID do relatório:", "Report ID:"],
    /** Common export typo / font glitch: “Y” instead of “Sí” at line start. */
    ["Yesmbolo da análise:", "Analysis symbol:"],
    ["Relatório de erros do Windows", "Windows Error Reporting"],
    ["Erro de aplicativo", "Application Error"],
    ["Ambiente de Software", "Software Environment"],
    ["Ambiente de software", "Software Environment"],
    /** pt-BR MSInfo — Network adapter property names (often shown as raw keys next to canonical English rows). */
    ["Identificação de dispositivo PNP", "PNP Device ID"],
    ["Identificação do dispositivo PNP", "PNP Device ID"],
    ["Concessão DHCP Expira em", "DHCP Lease Expires"],
    ["Concessão DHCP Obtida em", "DHCP Lease Obtained"],
    ["Concessão DHCP expira em", "DHCP Lease Expires"],
    ["Concessão DHCP obtida em", "DHCP Lease Obtained"],
    ["Gateway IP padrão", "Default IP Gateway"],
    ["Gateway IP Padrão", "Default IP Gateway"],
    ["Endereço de memória", "Memory Address"],
    ["Endereço MAC", "MAC Address"],
    ["Última redefinição", "Last Reset"],
    ["Nome do serviço", "Service Name"],
    ["Tipo de produto", "Product Type"],
    ["Tipo de adaptador", "Adapter Type"],
    ["Canal IRQ", "IRQ Channel"],
    ["Endereço IP", "IP Address"],
    ["Endereços IP", "IP addresses"],
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
    ["Automatisk (fördröjd start)", "Automatic (Delayed Start)"],
    ["Automatisk (fordrojd start)", "Automatic (Delayed Start)"],
    ["Manuell (utlösarstart)", "Manual (Trigger Start)"],
    ["Manuell (utlosarstart)", "Manual (Trigger Start)"],
    ["Starttyp", "Startup type"],
    ["Tillstånd", "State"],
    ["Visningsnamn", "Display name"],
    ["Tjänstnamn", "Service name"],
    ["Tjanstnamn", "Service name"],
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
    ["NVIDIA 互換", "NVIDIA-compatible"],
    ["Intel 互換", "Intel-compatible"],
    ["互換", "compatible"],
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

  /**
   * Turkish Windows service / UI display strings → English (offline; best-effort for Translate).
   * Longer phrases first; merged into {@link MSINFO_I18N_EN_TOKEN_PAIRS} after sort.
   * @type {readonly (readonly [string, string])[]}
   */
  const LOCALE_PAIRS_MSINFO_TR_SERVICES = [
    ["Windows Ses Bitiş Noktası Oluşturucu", "Windows Audio Endpoint Builder"],
    ["Arka Plan Görevleri Altyapı Hizmeti", "Background Tasks Infrastructure Service"],
    ["Yetenek Erişim Yöneticisi Hizmeti", "Capability Access Manager Service"],
    ["Bağlı Cihazlar Platformu Hizmeti", "Connected Devices Platform Service"],
    ["Uygulama Katmanı Ağ Geçidi Hizmeti", "Application Layer Gateway Service"],
    ["Uygulama Katmanı Network Geçidi Hizmeti", "Application Layer Gateway Service"],
    ["Uygulama Hazır Olma Durumu", "Application Readiness"],
    ["AssignedAccessManager Hizmeti", "AssignedAccessManager Service"],
    ["AllJoyn Yönlendirici Hizmeti", "AllJoyn Router Service"],
    ["Temel Filtre Altyapısı", "Base Filtering Engine"],
    ["Uygulama Bilgileri", "Application Information"],
    ["Uygulama Yönetimi", "Application Management"],
    ["Uygulama Kimliği", "Application Identity"],
    ["Uygulama Katmanı", "Application Layer"],
    ["Yazdırma Biriktiricisi", "Print Spooler"],
    ["Uzaktan Kayıt Defteri", "Remote Registry"],
    ["Konuk Ağ Hizmeti", "Guest Service"],
    ["Konum Bildirimi", "Location Notification"],
    ["Ağ Bağlantısı Yardımcısı", "Network Connection Broker"],
    ["Ağ Listesi Hizmeti", "Network List Service"],
    ["Ağ Depolama Hizmeti", "Network Store Interface Service"],
    ["Yerel Oturum Yardımcısı", "Local Session Manager"],
    ["Yerel Olay Günlüğü", "Windows Event Log"],
    ["Güvenlik Hesabı Yöneticisi", "Security Accounts Manager"],
    ["Güvenlik Merkezi", "Security Center"],
    ["Windows Güvenlik Hizmeti", "Microsoft Defender Antivirus Service"],
    ["Windows Güncelleştirmesi", "Windows Update"],
    ["Windows Zamanı", "Windows Time"],
    ["Windows Bağlantısı", "Windows Connection"],
    ["Windows Yönetim Araçları", "Windows Management Instrumentation"],
    ["Windows Yönetim Araçları Hizmeti", "Windows Management Instrumentation"],
    ["Yönetim Araçları", "Management Instrumentation"],
    ["Cihaz Kurulum Yöneticisi", "Device Setup Manager"],
    ["Cihaz Seçici", "Device Association Service"],
    ["Dağıtılmış Bağlantı İzleme İstemcisi", "Distributed Link Tracking Client"],
    ["Dağıtılmış İşlem Düzenleyicisi", "Distributed Transaction Coordinator"],
    ["DNS İstemcisi", "DNS Client"],
    ["DHCP İstemcisi", "DHCP Client"],
    ["Görev Zamanlayıcı", "Task Scheduler"],
    ["Uzaktan Yordam Çağrısı", "Remote Procedure Call"],
    ["Uzaktan Yordam Çağrısı (RPC)", "Remote Procedure Call (RPC)"],
    ["Windows Ses", "Windows Audio"],
    ["AVCTP hizmeti", "AVCTP service"],
    ["AVCTP Hizmeti", "AVCTP service"],
    ["uygulama bilgileri", "Application Information"],
    ["windows ses", "Windows Audio"],
    /** Display names from Turkish Language Adder (services / drivers list); longest keys rely on global merge sort. */
    ["Windows Sistem Durumu ve İyileştirilmiş Deneyimler", "Windows Health and Optimized Experiences"],
    ["Microsoft Kullanım ve Kalite İçgörüleri", "Connected User Experiences and Telemetry"],
    ["Microsoft Hesabı Oturum Açma Yardımcısı", "Microsoft Account Sign-in Assistant"],
    ["İşlev Bulma Sağlayıcısı Ana Bilgisayarı", "Function Discovery Provider Host"],
    ["İşlev Bulma Kaynak Yayımı", "Function Discovery Resource Publication"],
    ["Bağlı Kullanıcı Deneyimleri ve Telemetrisi", "Connected User Experiences and Telemetry"],
    ["IKE ve AuthIP IPsec Anahtarlama Modülleri", "IKE and AuthIP IPsec Keying Modules"],
    ["Internet Bağlantısı Paylaşımı (ICS)", "Internet Connection Sharing (ICS)"],
    ["RPC Bitiş Noktası Eşleştiricisi", "RPC Endpoint Mapper"],
    ["Sistem Etkinlikleri Aracısı", "System Events Broker"],
    ["Tanılama Sistemi Ana Bilgisayarı", "Diagnostic System Host"],
    ["TCP/IP NetBIOS Yardımcısı", "TCP/IP NetBIOS Helper"],
    ["Uzaktan Erişim Bağlantı Yöneticisi", "Remote Access Connection Manager"],
    ["Windows Bağlantı Yöneticisi", "Windows Connection Manager"],
    ["Windows Defender Güvenlik Duvarı", "Windows Defender Firewall"],
    ["Windows Olay Günlüğü", "Windows Event Log"],
    ["Windows Yönetim Yardımcıları", "Windows Management Instrumentation"],
    ["Xbox Live Kimlik Doğrulama Yöneticisi", "Xbox Live Auth Manager"],
    ["Hyper-V Birim Gölge Kopyası İsteyicisi", "Hyper-V Volume Shadow Copy Requestor"],
    ["Microsoft Yazılımı Gölge Kopya Sağlayıcısı", "Microsoft Software Shadow Copy Provider"],
    ["Microsoft Depolama Alanları SMP", "Microsoft Storage Spaces SMP"],
    ["Performans Günlükleri ve Uyarıları", "Performance Logs & Alerts"],
    ["Sorun Raporları Denetim Masası Desteği", "Problem Reports and Control Panel Support"],
    ["Windows Kamera Çerçeve Sunucusu İzleyicisi", "Windows Camera Frame Server Monitor"],
    ["Windows Şimdi Bağlan - Yapılandırma Dosyası Kaydedici", "Windows Connect Now - Config Registrar"],
    ["Windows Uzaktan Yönetim (WS-Management)", "Windows Remote Management (WS-Management)"],
    ["WMI Performans Bağdaştırıcısı", "WMI Performance Adapter"],
    ["Yazıcı Uzantıları ve Bildirimleri", "Printer Extensions and Notifications"],
    ["Yönlendirme ve Uzaktan Erişim", "Routing and Remote Access"],
    ["ActiveX Yükleyicisi (AxInstSV)", "ActiveX Installer (AxInstSV)"],
    ["Akıllı Kart Kaldırma İlkesi", "Smart Card Removal Policy"],
    ["Aygıt Kurulum Yöneticisi", "Device Setup Manager"],
    ["Bağlantı Katmanı Topoloji Bulma Eşleyicisi", "Link-Layer Topology Discovery Mapper"],
    ["Birim Gölge Kopyası", "Volume Shadow Copy"],
    ["COM+ Sistem Uygulaması", "COM+ System Application"],
    ["Depolama Katmanları Yönetimi", "Storage Spaces Management"],
    ["DevQuery Arka Plan Keşfi Aracısı", "DevQuery Background Discovery Broker"],
    ["Genişletilebilir Kimlik Doğrulama Protokolü", "Extensible Authentication Protocol"],
    ["İndirilen Haritalar Yöneticisi", "Downloaded Maps Manager"],
    ["Natural Kimlik Doğrulaması", "Natural Authentication"],
    ["Ödeme ve NFC/SE Yöneticisi", "Payment and NFC/SE Manager"],
    ["Performans Sayacı DLL Konak", "Performance Counter DLL Host"],
    ["Resim Alma Olayları", "Still Image Acquisition Events"],
    ["Sürücüleri en iyi duruma getir", "Optimize drives"],
    ["UPnP Aygıt Ana Makinesi", "UPnP Device Host"],
    ["Uzak Kayıt Defteri", "Remote Registry"],
    ["Windows Kamera Çerçeve Sunucusu", "Windows Camera Frame Server"],
    ["Windows Olay Toplayıcısı", "Windows Event Collector"],
    ["DCOM Sunucusu İşlem Başlatıcısı", "DCOM Server Process Launcher"],
    ["Grup İlkesi İstemcisi", "Group Policy Client"],
    ["Güvenlik Hesapları Yöneticisi", "Security Accounts Manager"],
    ["IPsec İlke Aracısı", "IPsec Policy Agent"],
    ["Kabuk Donanım Algılaması", "Shell Hardware Detection"],
    ["Kimlik Bilgisi Yöneticisi", "Credential Manager"],
    ["Microsoft Passport Kapsayıcı", "Microsoft Passport Container"],
    ["Teslim En İyileştirme", "Delivery Optimization"],
    ["Web Hesap Yöneticisi", "Web Account Manager"],
    ["CNG Anahtar Yalıtımı", "CNG Key Isolation"],
    ["İş İstasyonu", "Workstation"],
    ["İkincil Oturum Açma", "Secondary Logon"],
    ["Kullanıcı Yöneticisi", "User Profile Service"],
    ["Nokta Doğrulayıcısı", "Spot Verifier"],
    ["Windows Modül Yükleyicisi", "Windows Modules Installer"],
    ["Yazılım Koruması", "Software Protection"],
    ["Akıllı Kart", "Smart Card"],
    ["Çalışma Klasörleri", "Work Folders"],
    ["Hücresel Saat", "Cellular Time"],
    ["Veri Kullanımı", "Data Usage"],
    ["Zaman Aracısı", "Time Broker"],
    ["IP Yardımcısı", "IP Helper"],
    ["Şifreleme Hizmetleri", "Cryptographic Services"],
  ];

  /**
   * Portuguese (pt-BR) Windows service display names → English (offline Translate; same role as {@link LOCALE_PAIRS_MSINFO_TR_SERVICES}).
   * Longer strings win globally after merge sort.
   * @type {readonly (readonly [string, string])[]}
   */
  /**
   * Swedish (sv) Windows service display names → English (offline Translate; same role as TR/PT tables).
   * @type {readonly (readonly [string, string])[]}
   */
  const LOCALE_PAIRS_MSINFO_SV_SERVICES = [
    ["Intelligent bakgrundsoverföringstjänst (BITS)", "Background Intelligent Transfer Service"],
    ["Intelligent bakgrundsoverföringstjänst", "Background Intelligent Transfer Service"],
    ["Infrastrukturtjänst för bakgrundsuppgifter", "Background Tasks Infrastructure Service"],
    ["Anslutna enheter plattformstjänst", "Connected Devices Platform Service"],
    ["Microsoft Defender Antivirus-tjänst", "Microsoft Defender Antivirus Service"],
    ["Microsoft Defender Antivirus-tjanst", "Microsoft Defender Antivirus Service"],
    ["Hantering av kapabilitetstillgång", "Capability Access Manager Service"],
    ["Funktionsidentifieringsresurspublicering", "Function Discovery Resource Publication"],
    ["Distribuerad länkspårning klient", "Distributed Link Tracking Client"],
    ["Distribuerad lanksparning klient", "Distributed Link Tracking Client"],
    ["Distribuerad transaktionskoordinator", "Distributed Transaction Coordinator"],
    ["Nätverksanslutningsmäklare", "Network Connection Broker"],
    ["Natverksanslutningsmaklare", "Network Connection Broker"],
    ["Nätverkslistetjänst", "Network List Service"],
    ["Natverkslistetjanst", "Network List Service"],
    ["Nätverkslagringsgränssnittstjänst", "Network Store Interface Service"],
    ["Natverkslagringsgranssnittstjanst", "Network Store Interface Service"],
    ["Lokal sessionshanterare", "Local Session Manager"],
    ["DCOM-serverprocessstart", "DCOM Server Process Launcher"],
    ["Diagnostikpolicytjänst", "Diagnostic Policy Service"],
    ["Diagnostikpolicytjanst", "Diagnostic Policy Service"],
    ["Diagnostiksystemvärd", "Diagnostic System Host"],
    ["Diagnostiksystemvard", "Diagnostic System Host"],
    ["Programgatewaytjänst", "Application Layer Gateway Service"],
    ["Programgatewaytjanst", "Application Layer Gateway Service"],
    ["Programinformation", "Application Information"],
    ["Programidentitet", "Application Identity"],
    ["Programhantering", "Application Management"],
    ["Appberedskap", "App Readiness"],
    ["AppX-distributionstjänst (AppXSVC)", "AppX Deployment Service (AppXSVC)"],
    ["AppX-distributionstjanst (AppXSVC)", "AppX Deployment Service (AppXSVC)"],
    ["AppX-distributionstjänst", "AppX Deployment Service"],
    ["Basfiltreringsmotor", "Base Filtering Engine"],
    ["Bluetooth-stödtjänst", "Bluetooth Support Service"],
    ["Bluetooth-stodtjanst", "Bluetooth Support Service"],
    ["IPsec-policyagent", "IPsec Policy Agent"],
    ["IP-hjälp", "IP Helper"],
    ["IP-hjalp", "IP Helper"],
    ["Kryptografiska tjänster", "Cryptographic Services"],
    ["Kryptografiska tjanster", "Cryptographic Services"],
    ["Fjärrregister", "Remote Registry"],
    ["Säkerhetshanteraren för lokala konton", "Security Accounts Manager"],
    ["Sakerhetshanteraren for lokala konton", "Security Accounts Manager"],
    ["Säkerhetscenter", "Security Center"],
    ["Sakerhetscenter", "Security Center"],
    ["Gruppolicyklient", "Group Policy Client"],
    ["Användarprofiltjänst", "User Profile Service"],
    ["Anvandarprofiltjanst", "User Profile Service"],
    ["Utskriftskö", "Print Spooler"],
    ["Utskriftsko", "Print Spooler"],
    ["Schemaläggaren", "Task Scheduler"],
    ["Schemalaggaren", "Task Scheduler"],
    ["Händelselogg för Windows", "Windows Event Log"],
    ["Handelselogg for Windows", "Windows Event Log"],
    ["Windows-brandväggen", "Windows Firewall"],
    ["Windows-brandvaggen", "Windows Firewall"],
    ["Windows-tid", "Windows Time"],
    ["Windows-anslutningshanteraren", "Windows Connection Manager"],
    ["Fjärrproceduranrop (RPC)", "Remote Procedure Call (RPC)"],
    ["Fjärrproceduranrop", "Remote Procedure Call"],
    ["RPC-slutpunktsmappare", "RPC Endpoint Mapper"],
    ["SSDP-upptäckt", "SSDP Discovery"],
    ["SSDP-upptackt", "SSDP Discovery"],
    ["Teman", "Themes"],
    ["Arbetsstation", "Workstation"],
    ["WLAN-autokonfiguration", "WLAN AutoConfig"],
    ["Trådad autokonfiguration", "Wired AutoConfig"],
    ["Tradad autokonfiguration", "Wired AutoConfig"],
    ["Enhetskonfigurationshanteraren", "Device Setup Manager"],
    ["Enhetsassocieringstjänst", "Device Association Service"],
    ["Enhetsassocieringstjanst", "Device Association Service"],
    ["Programvaruskydd", "Software Protection"],
    ["BitLocker-enhetskryptering", "BitLocker Drive Encryption Service"],
    ["Datadelningstjänst", "Data Sharing Service"],
    ["Datadelningstjanst", "Data Sharing Service"],
    ["Lagringstjänst", "Storage Service"],
    ["Lagringstjanst", "Storage Service"],
    ["Tjänst för aggregerad dataplattform", "Aggregate Data Platform Service"],
    ["Tjanst for aggregerad dataplattform", "Aggregate Data Platform Service"],
    ["Ljudgatewaytjänst för Bluetooth", "Bluetooth Audio Gateway Service"],
    ["Ljudgatewaytjanst for Bluetooth", "Bluetooth Audio Gateway Service"],
    ["Proxytjänst för virtuellt ljud i Windows", "Windows Virtual Audio Device Proxy Service"],
    ["Proxytjanst for virtuellt ljud i Windows", "Windows Virtual Audio Device Proxy Service"],
    ["Tid från mobilnät", "Cellular Time"],
    ["Tid fran mobilnat", "Cellular Time"],
    ["DNS-klient", "DNS Client"],
    ["DHCP-klient", "DHCP Client"],
    ["Klient för Microsoft App-V", "Microsoft App-V Client"],
    ["Klient for Microsoft App-V", "Microsoft App-V Client"],
    ["AVCTP-tjänst", "AVCTP service"],
    ["AVCTP-tjanst", "AVCTP service"],
    ["Hjälp och support", "Help and Support"],
    ["Hjalp och support", "Help and Support"],
    ["Datorwebbläsare", "Computer Browser"],
    ["Gästtjänst", "Guest Service"],
    ["Gasttjanst", "Guest Service"],
    ["Platsmeddelanden", "Location Notification"],
  ];

  const LOCALE_PAIRS_MSINFO_PT_SERVICES = [
    ["Serviço proxy de dispositivo de áudio virtual do Windows", "Windows Virtual Audio Device Proxy Service"],
    ["Construtor de Pontos de Extremidade de Áudio do Windows", "Windows Audio Endpoint Builder"],
    ["Serviço de Plataforma de Dados Agregados", "Aggregate Data Platform Service"],
    ["Serviço de Plataforma de Yesdos Agregados", "Aggregate Data Platform Service"],
    ["Serviço Gateway de Camada de Aplicativo", "Application Layer Gateway Service"],
    ["Serviço de Implantação AppX (AppXSVC)", "AppX Deployment Service (AppXSVC)"],
    ["Serviço de Implantação AppX", "AppX Deployment Service"],
    ["Serviço AssignedAccessManager", "AssignedAccessManager Service"],
    ["Informações sobre Aplicativos", "Application Information"],
    ["Gerenciamento de aplicativo", "Application Management"],
    ["Gerenciamento de Aplicativos", "Application Management"],
    ["Preparação de Aplicativos", "App Readiness"],
    ["Identidade do Aplicativo", "Application Identity"],
    ["Serviço de Infraestrutura de Tarefas em Segundo Plano", "Background Tasks Infrastructure Service"],
    ["Serviço de Infraestrutura de Tarefas de Fundo", "Background Tasks Infrastructure Service"],
    ["Serviço de Gerenciamento de Acesso a Recursos", "Capability Access Manager Service"],
    ["Serviço de Plataforma de Dispositivos Conectados", "Connected Devices Platform Service"],
    ["Serviço de Infraestrutura de Filtro Básico", "Base Filtering Engine"],
    ["Serviço de Infraestrutura de Tarefas em Plano de Fundo", "Background Tasks Infrastructure Service"],
    ["Serviço de Agente de Políticas de IPsec", "IPsec Policy Agent"],
    ["Serviço de Auxiliar de Conexão de Rede", "Network Connection Broker"],
    ["Serviço de Lista de Redes", "Network List Service"],
    ["Serviço de Interface de Armazenamento em Rede", "Network Store Interface Service"],
    ["Serviço de Gerenciador de Sessão Local", "Local Session Manager"],
    ["Serviço de Log de Eventos do Windows", "Windows Event Log"],
    ["Serviço de Gerenciador de Contas de Segurança", "Security Accounts Manager"],
    ["Serviço Central de Segurança", "Security Center"],
    ["Serviço de Segurança do Windows", "Microsoft Defender Antivirus Service"],
    ["Serviço de Atualização do Windows", "Windows Update"],
    ["Serviço de Hora do Windows", "Windows Time"],
    ["Serviço de Instrumentação de Gerenciamento do Windows", "Windows Management Instrumentation"],
    ["Serviço de Configuração Automática de Dispositivos", "Device Setup Manager"],
    ["Serviço de Associação de Dispositivos", "Device Association Service"],
    ["Serviço de Rastreamento de Vínculos Distribuídos", "Distributed Link Tracking Client"],
    ["Serviço Coordenador de Transações Distribuídas", "Distributed Transaction Coordinator"],
    ["Serviço de Agendamento de Tarefas", "Task Scheduler"],
    ["Serviço de Chamada de Procedimento Remoto (RPC)", "Remote Procedure Call (RPC)"],
    ["Serviço de Chamada de Procedimento Remoto", "Remote Procedure Call"],
    ["Serviço de Cliente DHCP", "DHCP Client"],
    ["Serviço de Cliente DNS", "DNS Client"],
    ["Serviço de Registro Remoto", "Remote Registry"],
    ["Serviço de Convidado", "Guest Service"],
    ["Serviço de Notificação de Local", "Location Notification"],
    ["Serviço de Roteador AllJoyn", "AllJoyn Router Service"],
    ["Serviço de Spooler de Impressão", "Print Spooler"],
    ["Serviço de Transferência Inteligente em Segundo Plano", "Background Intelligent Transfer Service"],
    ["Serviço de Host de Plug and Play", "Plug and Play"],
    ["Serviço de Perfil de Usuário", "User Profile Service"],
    ["Serviço de Política de Diagnóstico", "Diagnostic Policy Service"],
    ["Serviço de Publicação de Descoberta de Função", "Function Discovery Resource Publication"],
    ["Serviço de Descoberta SSDP", "SSDP Discovery"],
    ["Serviço de Gateway de Áudio Bluetooth", "Bluetooth Audio Gateway Service"],
    ["Serviço de Compartilhamento de Dados", "Data Sharing Service"],
    ["Serviço de Armazenamento", "Storage Service"],
    ["Serviço de Criptografia de Unidade BitLocker", "BitLocker Drive Encryption Service"],
    ["Serviço de Licenciamento de Software de Proteção", "Software Protection"],
    ["Serviço de Ativação de Processo DCOM", "DCOM Server Process Launcher"],
    ["Serviço de Host de Sistema de Diagnóstico", "Diagnostic System Host"],
    ["Serviço de Compatibilidade com Bluetooth", "Bluetooth Support Service"],
    ["Serviço de Configuração Automática de WLAN", "WLAN AutoConfig"],
    ["Serviço de Configuração Automática de Rede Comercial", "Wired AutoConfig"],
    ["Serviço de Estação de Trabalho", "Workstation"],
    ["Serviço de Servidor", "Server"],
    ["Serviço de Navegador de Computador", "Computer Browser"],
    ["Serviço de Ajuda e Suporte", "Help and Support"],
    ["Serviço de Temas", "Themes"],
    ["Serviço de Áudio do Windows", "Windows Audio"],
    ["Áudio do Windows", "Windows Audio"],
    ["Cliente Microsoft App-V", "Microsoft App-V Client"],
    ["Cliente do Microsoft App-V", "Microsoft App-V Client"],
    ["AVCTP Serviço", "AVCTP service"],
    ["serviço AVCTP", "AVCTP service"],
    ["informações sobre aplicativos", "Application Information"],
    ["áudio do windows", "Windows Audio"],
  ];

  const MSINFO_I18N_EN_TOKEN_PAIRS = Object.freeze(
    /** @type {readonly (readonly [string, string])[]} */ (
      [
        ...LOCALE_PAIRS_MSINFO_RU,
        ...LOCALE_PAIRS_MSINFO_UK,
        ...LOCALE_PAIRS_MSINFO_UK_LABELS,
        ...LOCALE_PAIRS_MSINFO_INTL,
        ...LOCALE_PAIRS_MSINFO_TR_SERVICES,
        ...LOCALE_PAIRS_MSINFO_PT_SERVICES,
        ...LOCALE_PAIRS_MSINFO_SV_SERVICES,
      ].sort((a, b) => b[0].length - a[0].length)
    )
  );

  /** Fast membership check for whether a token is already present in our offline mapping keys. */
  const MSINFO_I18N_EN_TOKEN_KEYS = new Set(MSINFO_I18N_EN_TOKEN_PAIRS.map((p) => p[0]));

  /** Cross-tab hub snapshots for Advanced “GPU God’s Eye” (offline). */
  /** @type {{ logs: { name: string, parsed: ReturnType<typeof parseSensorCsv> | null }[] } | null} */
  let gpuHubSnapshot = null;
  /** @type {{ name: string, events: ReturnType<typeof parseWindowsEventXmlExport>, source: string } | null} */
  let evtxHubSnapshot = null;

  function isAdvancedModeOn() {
    return document.documentElement.getAttribute("data-advanced") === "on";
  }

  function dispatchGpuHubUpdated() {
    try {
      window.dispatchEvent(new CustomEvent("rv-gpu-hub", { bubbles: false }));
    } catch {
      /* */
    }
  }

  function dispatchEvtxHubUpdated() {
    try {
      window.dispatchEvent(new CustomEvent("rv-evtx-hub", { bubbles: false }));
    } catch {
      /* */
    }
  }

  /**
   * One pass of the sorted {@link MSINFO_I18N_EN_TOKEN_PAIRS} table (longer keys first).
   * @param {string} str
   */
  function applyMsinfoI18nTokenPairTable(str) {
    let o = String(str ?? "");
    for (const pair of MSINFO_I18N_EN_TOKEN_PAIRS) {
      const from = pair[0];
      const to = pair[1];
      if (!from || o.indexOf(from) === -1) continue;
      o = o.split(from).join(to);
    }
    return o;
  }

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
    let t = String(s ?? "");
    /** Exports sometimes double-escape numeric refs ({@code &amp;#x000d;}) so they survive as literals in text. */
    for (let i = 0; i < 4; i++) {
      const n = t.replace(/&amp;(#x[0-9a-fA-F]{1,6};|#\d{1,7};)/gi, "&$1");
      if (n === t) break;
      t = n;
    }
    return decodeMsinfoNumericHtmlEntities(t)
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
    // Normalize composed accents for consistent regex matching (e.g. "cœur(s)").
    try {
      out = out.normalize("NFC");
    } catch {
      /* */
    }
    /** JP volume lines use 「ドライブ C:」; do not let the standalone 「ドライブ」→「Driver」 pair corrupt those. */
    out = out.replace(/ドライブ\s*([A-Z])[：:]/gi, "Drive $1:");
    /**
     * Pre-table: Ukrainian byte-suffix forms must be normalized BEFORE the phrase table runs, otherwise
     * the Russian {@code ") байт"} pair (length 6) can sort-tie with {@code байтів} (length 6) and replace
     * the prefix → leaves the trailing suffix as {@code "bytesів"}.
     * Replace the longer Cyrillic forms first, anchored only by their endings (no digit context — the value
     * may already be inside parentheses, e.g. {@code "(1 048 576) байтів"}).
     */
    out = out
      .replace(/байт(?:і|i)в/giu, "bytes")
      .replace(/байтов\b/giu, "bytes")
      .replace(/(\d[\d\s\u00A0\u202F]*)\s*байт(?=[\s),]|$)/giu, "$1 bytes");
    out = applyMsinfoI18nTokenPairTable(out);
    /** Spacing in MSInfo text exports varies; apply regex fallbacks after phrase table. */
    out = out
      .replace(/プロセッサ\s+ドライバー/g, "Processor driver")
      .replace(/カーネル\s+ドライバー?/g, "Kernel driver")
      .replace(/手動停止\s*OK/gi, "Manual stop OK")
      /** French size units: Go/Mo/Ko in memory lines. */
      .replace(/(\d[\d\s.,]*)\s*Go\b/giu, "$1 GB")
      .replace(/(\d[\d\s.,]*)\s*Mo\b/giu, "$1 MB")
      .replace(/(\d[\d\s.,]*)\s*Ko\b/giu, "$1 KB")
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
      .replace(/\bMhz\b/gi, "MHz")
      /** No \\b: JS word boundaries only treat ASCII [A-Za-z0-9_] as words, so Turkish letters break \\b…\\b matches. */
      .replace(/Mantıksal\s+İşlemci/giu, "logical processor")
      .replace(/Mantıksal\s+Processor/giu, "logical processor")
      .replace(/Çekirdek/giu, "core")
      .replace(/Masaüstü/giu, "Desktop")
      .replace(/Dizüstü/giu, "Laptop")
      .replace(/Taşınabilir/giu, "Mobile")
      /** Turkish {@code Platform Rolü} value is often {@code Mobil} (ASCII; distinct from English “Mobile”). */
      .replace(/\bMobil\b/gi, "Mobile")
      .replace(/\bOrta\s+Avrupa\s+Yaz\s+Saati\b/giu, "Central European Summer Time")
      .replace(/\bOrta\s+Avrupa\s+Kış\s+Saati\b/giu, "Central European Standard Time")
      .replace(/\bOrta\s+Avrupa\s+Standart\s+Saati\b/giu, "Central Europe Standard Time")
      .replace(/Türkiye\s+Standart\s+Saati/giu, "Turkey Standard Time")
      /** Turkish disk lines: “217,40 GB (233.429.532.672 Bayt)”. Order: *bayt before bare Bayt. */
      .replace(/\bTerabayt\b/gi, "TB")
      .replace(/\bGigabayt\b/gi, "GB")
      .replace(/\bMegabayt\b/gi, "MB")
      .replace(/\bKilobayt\b/gi, "KB")
      .replace(/\(\s*([\d.\s]+)\s*Bayt\s*\)/gi, "($1 bytes)")
      .replace(/\bBayt\b/gi, "bytes")
      .replace(/\bDerleme\b/giu, "Build")
      /** Remaining Turkish service title fragments (after full-phrase table). */
      .replace(/\s+Hizmeti\b/giu, " Service")
      .replace(/\bYönlendirici\s+/giu, "Router ")
      .replace(/\byönlendirici\s+/giu, "Router ")
      .replace(/\bAltyapısı\b/giu, "Infrastructure")
      .replace(/\bAltyapisi\b/giu, "Infrastructure")
      .replace(/\bOluşturucu\b/giu, "Builder")
      .replace(/\bOlusturucu\b/giu, "Builder")
      .replace(/\bYöneticisi\s+/giu, "Manager ")
      .replace(/\bYoneticisi\s+/giu, "Manager ")
      .replace(/\bGeçidi\b/giu, "Gateway")
      .replace(/\bGecidi\b/giu, "Gateway")
      .replace(/\s+hertz\b/giu, " Hz")
      .replace(/\bHertz\b/g, "Hz")
      .replace(/\bNVIDIA\s+uyumlu\b/giu, "NVIDIA-compatible")
      .replace(/\bAMD\s+uyumlu\b/giu, "AMD-compatible")
      .replace(/\bIntel\s+uyumlu\b/giu, "Intel-compatible")
      .replace(/\buyumlu\b/giu, "compatible")
      /** Turkish MSInfo yes/no and size tokens (network + driver lines). */
      .replace(/\bEvet\b/gu, "Yes")
      .replace(/\bHayır\b/gu, "No")
      .replace(/\bKBayt\b/giu, "KB")
      .replace(/\bMBayt\b/giu, "MB")
      .replace(/\bGBayt\b/giu, "GB")
      /** Turkish network / IRQ row titles when shown as raw keys. */
      .replace(/\bBellek Adresi\b/giu, "Memory address")
      .replace(/\bIRQ Kanalı\b/giu, "IRQ channel")
      .replace(/\bDHCP Sunucusu\b/giu, "DHCP server")
      /** Spanish MSInfo (processor line, platform role value, system type). */
      .replace(/\bprocesadores\s+lógicos\b/giu, "logical processors")
      .replace(/\bprocesadores\s+logicos\b/giu, "logical processors")
      .replace(/\bprocesadores\s+principales\b/giu, "physical processors")
      .replace(/\bPC\s+basado\s+en\s+(x64|x86|arm64)\b/giu, (_, arch) => {
        const a = String(arch).toLowerCase();
        const label = a === "arm64" ? "ARM64" : a;
        return `${label}-based PC`;
      })
      .replace(/\bEquipo\s+basado\s+en\s+(x64|x86|arm64)\b/giu, (_, arch) => {
        const a = String(arch).toLowerCase();
        const label = a === "arm64" ? "ARM64" : a;
        return `${label}-based PC`;
      })
      .replace(/\bMóvil\b/gu, "Mobile")
      .replace(/\bMovil\b/gu, "Mobile")
      .replace(/\bEscritorio\b/giu, "Desktop")
      .replace(/\bSobremesa\b/giu, "Desktop")
      .replace(/\bPortátil\b/giu, "Laptop")
      .replace(/\bPortatil\b/giu, "Laptop")
      /** French MSInfo (summary: system type, platform role, time zone). */
      .replace(/\bPC\s+(?:à\s+base\s+de|a\s+base\s+de)\s+(x64|x86|arm64)\b/giu, (_, arch) => {
        const a = String(arch).toLowerCase();
        const label = a === "arm64" ? "ARM64" : a;
        return `${label}-based PC`;
      })
      .replace(/\bBureau\b/gu, "Desktop")
      .replace(/\bOrdinateur\s+portable\b/giu, "Laptop")
      .replace(/\bAfr\.\s*centrale\s*Ouest\b/giu, "W. Central Africa Standard Time")
      // Avoid \b here: JS word-boundary is ASCII-only and fails on "œ".
      .replace(/(\d+)\s*c(?:œ|oe)ur\(s\),\s*(\d+)\s*processeur\(s\)\s*logique\(s\)/giu, "$1 cores, $2 logical processors")
      .replace(/(\d+)\s*c(?:œ|oe)ur\(s\)/giu, "$1 cores")
      .replace(/(\d+)\s*processeur\(s\)\s*logique\(s\)/giu, "$1 logical processors")
      .replace(/processeur\(s\)\s*logique\(s\)/giu, "logical processors")
      .replace(/c(?:œ|oe)ur\(s\)/giu, "cores")
      .replace(/\bPC\s+baseado\s+em\s+(x64|x86|ARM64)\b/giu, (_, arch) => {
        const a = String(arch).toLowerCase();
        const label = a === "arm64" ? "ARM64" : a;
        return `${label}-based PC`;
      })
      .replace(/\bComputador\s+baseado\s+em\s+(x64|x86|ARM64)\b/giu, (_, arch) => {
        const a = String(arch).toLowerCase();
        const label = a === "arm64" ? "ARM64" : a;
        return `${label}-based PC`;
      })
      .replace(/\bÁrea\s+de\s+Trabalho\b/giu, "Desktop")
      .replace(/\bArea\s+de\s+Trabalho\b/giu, "Desktop")
      /** Portuguese MSInfo GPU / adapter strings (“… compatível com NVIDIA”). */
      .replace(/\bcompat[ií]vel\s+com\b/giu, "compatible with")
      /** Spanish MSInfo GPU / display (“compatible con …”, “No disponible”, refresh rate “hercios”). */
      .replace(/\bcompatible\s+con\b/giu, "compatible with")
      .replace(/\bNo\s+disponible\b/giu, "Not available")
      .replace(/\s+hercios\b/giu, " Hz")
      /** pt-BR WER: alternate wording, line breaks, or OCR (“Yesmbolo”) vs exact {@link MSINFO_I18N_EN_TOKEN_PAIRS} keys. */
      .replace(/\bYesmbolo\s+da\s+análise\s*:/giu, "Analysis symbol:")
      .replace(/ID\s+do\s+Relatório\s*:/giu, "Report ID:")
      .replace(/Status\s+do\s+Relatório\s*:/giu, "Report status:")
      .replace(/Esses\s+arquivos\s+talvez\s+estejam\s+disponíveis\s+em\s*:/giu, "These files may be available at:")
      .replace(/Verificando\s+novamente\s+se\s+há\s+uma\s+solução\s*:/giu, "Searching for solutions:")
      .replace(/Bucket\s+com\s+hash\s*:/giu, "Hashed container:")
      .replace(/GUID\s+do\s+CAB\s*:/giu, "CAB ID:")
      .replace(/Guid\s+do\s+CAB\s*:/giu, "CAB ID:")
      .replace(/(^|[\s,;:])(Sim)([\s,;:\)]|$)/gu, "$1Yes$3")
      .replace(/(^|[\s,;:])(Não|Nao)([\s,;:\)]|$)/gu, "$1No$3")
      /** Portuguese Windows Services table cells (state / startup); complements case-sensitive {@link MSINFO_I18N_EN_TOKEN_PAIRS}. */
      .replace(/\bEm\s+Execu[cç][aã]o\b/giu, "Running")
      .replace(/\bParado\b/gu, "Stopped")
      .replace(/\bDesabilitado\b/gu, "Disabled")
      .replace(/\bAutom[aá]tico\b/gu, "Automatic")
      /**
       * Portuguese MSInfo processor summary — cores / logical processors (often mixed with English “Processor”):
       * {@code …, 8 Núcleo(s), 16 Processor(es) Lógico(s)}.
       */
      .replace(/(\d+)\s*Processor\(es\)\s+L[óo]gico\(s\)/giu, "$1 logical processors")
      .replace(/(\d+)\s*Processador\(es\)\s+L[óo]gico\(s\)/giu, "$1 logical processors")
      .replace(/(\d+)\s*N[uú]cleo\(s\)/giu, "$1 cores")
      .replace(/\b(\d+)\s+processadores\s+l[oó]gicos\b/giu, "$1 logical processors")
      .replace(/\b(\d+)\s+n[uú]cleos\b/giu, "$1 cores")
      /** Ukrainian MSInfo — processor line “3800 МГц, ядер 8, логічних процесорів 16”; OS “10.0.26200 Збірка 26200”. */
      .replace(/,\s*ядер\s+(\d+),\s*логічних\s+процесорів\s+(\d+)/giu, ", $1 cores, $2 logical processors")
      .replace(/\bМГц\b/giu, "MHz")
      .replace(/\bГГц\b/giu, "GHz")
      .replace(/(\d+\.\d+\.\d+)\s+Збірка\s+(\d+)/giu, "$1 Build $2")
      .replace(/\bРобочий\s+стіл\b/giu, "Desktop")
      /** Ukrainian byte-suffix forms (after-table net): values inside parens like {@code "(… ) байтів"} also covered. */
      .replace(/байт(?:і|i)в/giu, "bytes")
      .replace(/байтов\b/giu, "bytes")
      .replace(/(\d[\d\s\u00A0\u202F]*)\s*байт(?=[\s),]|$)/giu, "$1 bytes")
      /** Ukrainian display / GPU adapter strings ("…-сумісний"). */
      .replace(/\bNVIDIA-сумісний\b/giu, "NVIDIA-compatible")
      .replace(/\bAMD-сумісний\b/giu, "AMD-compatible")
      .replace(/\bIntel-сумісний\b/giu, "Intel-compatible")
      .replace(/-сумісний\b/giu, "-compatible")
      .replace(/\bсумісний\b/giu, "compatible")
      /** Ukrainian misc UI strings. {@code \b} is ASCII-only in JS — use Unicode boundaries (start/space/punct). */
      .replace(/(^|[\s,;:()\[\]"'])Недоступно([\s,;:()\[\]"'.]|$)/gu, "$1Not available$2")
      .replace(/(^|[\s,;:()\[\]"'])Так([\s,;:()\[\]"'.]|$)/gu, "$1Yes$2")
      .replace(/(^|[\s,;:()\[\]"'])Ні([\s,;:()\[\]"'.]|$)/gu, "$1No$2")
      /** Spanish WER (Problem Reports) — labels vary by build; regex covers spacing / short forms. */
      .replace(/\bNombre\s+de\s+evento\s*:/giu, "Event name:")
      .replace(/\bId\.\s*de\s+informe\s*:/giu, "Report identifier:")
      .replace(/\bDep[oó]sito\s+con\s+algoritmo\s+hash\s*:/giu, "Hashed container:")
      .replace(
        /\bEs\s+posible\s+que\s+estos\s+archivos\s+est[eé]n\s+disponibles\s+aqu[ií]\s*:/giu,
        "These files may be available here:"
      )
      .replace(/\bNueva\s+b[uú]squeda\s+de\s+una\s+soluci[oó]n\s*:/giu, "Searching for solutions:")
      .replace(/\bVerificando\s+nuevamente\s+si\s+hay\s+una\s+soluci[oó]n\s*:/giu, "Searching for solutions:")
      .replace(/\bRespuesta\s*:\s*No\s+disponible\b/giu, "Response: Unavailable")
      /** Spanish WER — ASCII-only line; distinct from “Identificador de archivo .cab”. */
      .replace(/\bGUID\s+de\s+archivo\s*\.cab\s*:/giu, "CAB file GUID:")
      /** Swedish MSInfo (summary: processor line, platform role, time zone, system type). */
      .replace(/\b(\d+)\s*kärnor,\s*(\d+)\s+logiska\s+processorer\b/giu, "$1 cores, $2 logical processors")
      .replace(/\b(\d+)\s*kärnor\b/giu, "$1 cores")
      .replace(/\b(\d+)\s+logiska\s+processorer\b/giu, "$1 logical processors")
      .replace(/\blogiska\s+processorer\b/giu, "logical processors")
      .replace(/\bkärnor\b/giu, "cores")
      .replace(/\bStationär\s+dator\b/giu, "Desktop")
      .replace(/\bBärbar\s+dator\b/giu, "Laptop")
      .replace(/\bSurfplatta\b/giu, "Slate")
      .replace(/\bVästeuropa,\s*normaltid\b/giu, "W. Europe Standard Time")
      .replace(/\bCentraleuropeisk,\s*normaltid\b/giu, "Central Europe Standard Time")
      .replace(/\bx64-baserad\s+dator\b/giu, "x64-based PC")
      .replace(/\bx86-baserad\s+dator\b/giu, "x86-based PC")
      .replace(/\bARM64-baserad\s+dator\b/giu, "ARM64-based PC")
      /** Swedish WER (Problem Reports) — label lines; /u for å/ä/ö in “från”, “lösning”. */
      .replace(/\bFilerna\s+kan\s+vara\s+tillgängliga\s+här\s*:/giu, "These files might be available here:")
      .replace(/\bDessa\s+filer\s+finns\s+här\s*:/giu, "These files can be found here:")
      .replace(/\bBifogade\s+filer\s*:/giu, "Attached files:")
      .replace(/\bAnalyssymbol\s*:/giu, "Analysis symbol:")
      .replace(/\bKontrollerar\s+lösning\s+igen\s*:/giu, "Checking for solutions again:")
      .replace(/\bKontrollerar\s+losning\s+igen\s*:/giu, "Checking for solutions again:")
      .replace(/\bRapportstatus\s*:/giu, "Report status:")
      .replace(/\bGehashad\s+behållare\s*:/giu, "Hashed container:")
      /** Swedish localized Windows service display names (regex covers spacing/casing). */
      .replace(/\bProxytjänst\s+för\s+virtuellt\s+ljud\s+i\s+Windows\b/giu, "Windows Virtual Audio Device Proxy Service")
      .replace(/\bProxytjanst\s+för\s+virtuellt\s+ljud\s+i\s+Windows\b/giu, "Windows Virtual Audio Device Proxy Service")
      .replace(/\bTid\s+från\s+mobilnät\b/giu, "Cellular Time")
      .replace(/\bTid\s+fran\s+mobilnat\b/giu, "Cellular Time")
      .replace(/\bTjänst\s+för\s+aggregerad\s+dataplattform\b/giu, "Aggregate Data Platform Service")
      .replace(/\bTjanst\s+för\s+aggregerad\s+dataplattform\b/giu, "Aggregate Data Platform Service")
      .replace(/\bLjudgatewaytjänst\s+för\s+Bluetooth\b/giu, "Bluetooth Audio Gateway Service")
      /** Romanian startup type: never use substring token pair {@code Automat}→… (it corrupts “Automatic” → “Automaticicic”). */
      .replace(/\bAutomat\b/gu, "Automatic")
      /** Romanian “Da” = yes; never use substring pair (it corrupts “Daylight” → “Yesylight”). */
      .replace(/\bDa\b/gu, "Yes")
      /** Spanish MSInfo Services table headers when used as whole cell text (avoids touching “Nombre del SO”, etc.). */
      .replace(/^Nombre$/gu, "Name")
      .replace(/^Estado$/gu, "State")
      .replace(/^Tipo de inicio$/gu, "Startup type");
    /** Swedish service names often end with {@code -tjänst}; normalize after regex so phrase-table hits compound rows. */
    out = out.replace(/-tjänst\b/gu, " Service").replace(/-tjanst\b/gu, " Service");
    out = applyMsinfoI18nTokenPairTable(out);
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
  /**
   * @param {string | null | undefined} raw
   * @param {(s: string) => string} escFn
   * @param {string | null | undefined} [displayOverride]
   * @param {{ forceI18nSpan?: boolean }} [i18nOpts] When set (e.g. Services tables), always emit {@code .sum-i18n} so section Translate can swap ASCII-only localized text (pt-BR “Parado”, etc.).
   */
  function sumI18nSpan(raw, escFn, displayOverride, i18nOpts) {
    const s = String(raw ?? "").trim();
    if (!s) return escFn("—");
    const inner = displayOverride != null ? String(displayOverride) : s;
    const innerShown = normalizeMsinfoLineBreakEntities(inner);
    const force = i18nOpts && i18nOpts.forceI18nSpan === true;
    if (!force && !localeScriptLooksNonEnglishListed(normalizeMsinfoLineBreakEntities(s))) return escFn(innerShown);
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
   * Like {@link sumI18nSpan}, but also stores an English fallback (e.g. service key name) used when offline translation has no match.
   * @param {string | null | undefined} raw
   * @param {(s: string) => string} escFn
   * @param {string | null | undefined} altEnglish
   * @param {{ forceI18nSpan?: boolean }} [i18nOpts]
   */
  function sumI18nSpanWithAlt(raw, escFn, altEnglish, i18nOpts) {
    const s = String(raw ?? "").trim();
    if (!s) return escFn("—");
    const innerShown = normalizeMsinfoLineBreakEntities(s);
    const force = i18nOpts && i18nOpts.forceI18nSpan === true;
    if (!force && !localeScriptLooksNonEnglishListed(normalizeMsinfoLineBreakEntities(s))) return escFn(innerShown);
    let enc = "";
    try {
      enc = encodeURIComponent(s);
    } catch {
      enc = "";
    }
    const encAttr = enc ? ` data-i18n-enc="${enc}"` : "";
    const alt = String(altEnglish || "").trim();
    const altAttr = alt ? ` data-alt-en="${escFn(alt)}"` : "";
    return `<span class="sum-i18n"${encAttr}${altAttr} data-export="${escFn(s)}">${escFn(innerShown)}</span>`;
  }

  /**
   * Collapsible report block — same chrome as Problem Devices (green bar, icon, count, chevron).
   * @param {string} title
   * @param {string} bodyHtml inner HTML only
   * @param {(s: string) => string} esc
   * @param {{ count?: number | null, open?: boolean, icon?: string, variant?: "default" | "alert", alwaysOfferTranslate?: boolean, defaultTranslateOn?: boolean }} [opts]
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
    const needsTranslate =
      !!o.alwaysOfferTranslate || localeScriptLooksNonEnglishListed(plainForDetect);
    /** When the export is non-English, show English by default; user can press {@code Original} to revert. */
    const defaultOn = needsTranslate && o.defaultTranslateOn === true;
    const translateBtn = needsTranslate
      ? `<button type="button" class="report-category__translate" aria-pressed="${defaultOn ? "true" : "false"}"${defaultOn ? ` data-default-translate="1"` : ""}>${defaultOn ? "Original" : "Translate"}</button>`
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
        <div class="report-category__body-inner"><div class="report-category__i18n-root"${defaultOn ? ` data-default-translate="1"` : ""}>${bodyHtml}</div></div>
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
    const i18nForce = /** @type {{ forceI18nSpan: true }} */ ({ forceI18nSpan: true });
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
          <p class="os-winup__sub">${sumI18nSpan(winTitle, esc, undefined, i18nForce)}</p>
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
   * @param {{ forceI18nSpan?: boolean }} [i18nOpts]
   */
  function renderMotherboardBiosBody(sum, esc, i18nOpts) {
    const mb = sum.motherboard || {};
    const bm = sum.biosMeta || { ageDays: null, parsed: false };
    const links = motherboardSupportLinks(mb.manufacturer || "", mb.product || "");
    const biosFull =
      [sum.biosVersion, sum.biosDate].filter(Boolean).join(sum.biosVersion && sum.biosDate ? ", " : "") || "—";
    const parsedDate = tryParseBiosDate(String(sum.biosVersion || ""), String(sum.biosDate || ""));
    const man = (mb.manufacturer || "").trim();
    const prod = (mb.product || "").trim();
    const vendorName = man || "motherboard vendor";
    const modelForBlurb = prod || "system";
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
      lastUpdatedBlock = `<p class="mbbios-last"><strong>Date from export</strong> (not parsed to a single calendar day): ${sumI18nSpan(String(sum.biosDate), esc, undefined, i18nOpts)}</p>`;
    } else {
      lastUpdatedBlock = `<p class="mbbios-last mbbios-last--muted">No separate BIOS release date in this export — check the vendor site for current firmware.</p>`;
    }

    return `<div class="mbbios">
      <div class="mbbios-layout">
        <div class="mbbios-board">
          <div class="mbbios-info">
            <h4 class="mbbios-info__title"><span class="mbbios-info__glyph" aria-hidden="true">&#128203;</span> Motherboard information</h4>
            <dl class="mbbios-dl">
              <dt>Manufacturer</dt><dd>${sumI18nSpan(mb.manufacturer || "", esc, undefined, i18nOpts)}</dd>
              <dt>Model</dt><dd>${sumI18nSpan(mb.product || "", esc, undefined, i18nOpts)}</dd>
              ${mb.version ? `<dt>Version / serial</dt><dd>${sumI18nSpan(mb.version, esc, undefined, i18nOpts)}</dd>` : ""}
              <dt>Current BIOS</dt><dd>${sumI18nSpan(biosFull, esc, undefined, i18nOpts)}</dd>
            </dl>
          </div>
        </div>
        <div class="mbbios-status">
          <div class="mbbios-cards">
            <div class="mbbios-card mbbios-card--current">
              <span class="mbbios-card__kicker">Current BIOS</span>
              <p class="mbbios-card__value">${sumI18nSpan(biosFull, esc, undefined, i18nOpts)}</p>
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
        </div>
      </div>
      <div class="mbbios-update">
        <h4 class="mbbios-update__title"><span class="mbbios-update__glyph" aria-hidden="true">&#9432;</span> BIOS update check</h4>
        <div class="mbbios-update__grid">
          <div class="mbbios-update__lead">
            <p class="mbbios-update__copy">Visit the <strong>${sumI18nSpan(vendorName, esc, undefined, i18nOpts)}</strong> support site for the latest BIOS updates for your <strong>${sumI18nSpan(
      modelForBlurb,
      esc,
      undefined,
      i18nOpts
    )}</strong>.</p>
            ${lastUpdatedBlock}
          </div>
          <div class="mbbios-update__cta">
            <div class="rec-actions mbbios-actions">
              <a class="rec-btn rec-btn--primary" href="${esc(links.googleUrl)}" target="_blank" rel="noopener noreferrer">Check BIOS updates</a>
              <a class="rec-btn rec-btn--ghost" href="${esc(links.supportUrl)}" target="_blank" rel="noopener noreferrer">Support center</a>
            </div>
          </div>
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
   * @param {{ forceI18nSpan?: boolean }} [i18nOpts]
   */
  function renderWindowsErrorReportsBody(entries, esc, i18nOpts) {
    if (!entries || entries.length === 0) {
      return `<p class="summary-empty">No Windows Error Reporting / Problem Reports rows found in this export. MSInfo often <strong>omits</strong> the whole <strong>Software Environment → Windows Error Reporting</strong> branch when there are no archived problem reports, so there is nothing for this viewer to parse. Open the same <code>.nfo</code> in <strong>msinfo32</strong> and confirm that section exists; if it does not appear there either, export again after a problem is logged or check Windows build behavior.</p>`;
    }
    const uid = `w${Math.random().toString(36).slice(2, 10)}`;
    const analysis = werAnalyze(entries);
    const cats = [...new Set(entries.map((e) => werNormalizeCategory(e.category)))].sort();
    const showTabs = cats.length > 1;

    /** Human-readable local time when {@code time} is ISO from hex parsing. */
    const fmtWerTime = (/** @type {string} */ s) => {
      if (!s || s === "Unknown time") return s;
      const t = Date.parse(s);
      if (Number.isNaN(t)) return s;
      return new Date(t).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    };

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
              `<label class="wer-tab" for="wer-${uid}-c${i}"><span class="wer-tab__inner">${werCategoryIconSvg(c)}<span class="wer-tab__txt">${sumI18nSpan(c, esc, undefined, i18nOpts)}</span></span></label>`
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
            ? sumI18nSpan(e.details, esc, `${e.details.slice(0, 140)}…`, i18nOpts)
            : sumI18nSpan(e.details, esc, undefined, i18nOpts);
        const catKey = werNormalizeCategory(e.category);
        const cat = esc(catKey);
        return `<div class="wer-item ${sevClass}" data-wer-cat="${cat}">
        <div class="wer-item__marker" aria-hidden="true">${werCategoryIconSvg(catKey)}</div>
        <div class="wer-item__body">
          <div class="wer-item__head">
            <span class="wer-item__sev" title="${esc(sevTitle)}"><span class="wer-sev-dot wer-sev-dot--${e.severity}"></span></span>
            <span class="wer-item__type">${sumI18nSpan(e.type, esc, undefined, i18nOpts)}</span>
            <span class="wer-item__when">${esc(timeAgo(e.time))}</span>
          </div>
          <div class="wer-item__meta"><span class="muted-label">Time</span> ${esc(fmtWerTime(e.time))} · <span class="muted-label">Source</span> ${sumI18nSpan(
          e.sourceTitle,
          esc,
          undefined,
          i18nOpts
        )}</div>
          <p class="wer-item__preview">${prev}</p>
          <details class="wer-details">
            <summary class="wer-details__sum">Show full details</summary>
            <pre class="wer-details__pre">${sumI18nSpan(e.details, esc, undefined, i18nOpts)}</pre>
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
   * Concatenate common MSInfo summary fields for locale heuristics (Spanish vs French vs default).
   * @param {NonNullable<ReturnType<typeof extractSystemSummary>>} sum
   */
  function msinfoExportTextBlobForLocale(sum) {
    const mem = sum.memory || {};
    const drives = sum.storageDrives || [];
    const os = sum.os || {};
    const parts = [
      sum.systemTypeRaw,
      sum.processor,
      sum.platformRole,
      sum.timeZone,
      sum.systemForm,
      mem.installedRam,
      mem.totalPhysical,
      mem.availablePhysical,
      mem.totalVirtual,
      mem.availableVirtual,
      mem.pageFileSpace,
      mem.pageFileLocation,
      os.name,
      os.versionLine,
      os.build,
      os.installDate,
    ];
    for (const d of drives) {
      parts.push(d.title, d.fileSystem, d.totalSize, d.freeSpace, d.used, d.volumeName, d.serialNumber);
    }
    return parts.filter((p) => p && String(p).trim()).join(" | ");
  }

  /**
   * Heuristic: Spanish {@code msinfo32} export (labels + values often ASCII; section Translate must still apply).
   * @param {NonNullable<ReturnType<typeof extractSystemSummary>>} sum
   */
  function msinfoExportLooksSpanish(sum) {
    return looksLikeSpanishWindowsLatinHint(msinfoExportTextBlobForLocale(sum));
  }

  /**
   * Heuristic: French {@code msinfo32} export (mixed Latin; takes precedence over Spanish when both match).
   * @param {NonNullable<ReturnType<typeof extractSystemSummary>>} sum
   */
  function msinfoExportLooksFrench(sum) {
    return looksLikeFrenchWindowsLatinHint(msinfoExportTextBlobForLocale(sum));
  }

  /**
   * Heuristic: Turkish {@code msinfo32} export — many values are ASCII-only; needs {@code forceI18nSpan} + phrase map.
   * @param {NonNullable<ReturnType<typeof extractSystemSummary>>} sum
   */
  function msinfoExportLooksTurkish(sum) {
    return looksLikeTurkishWindowsLatinHint(msinfoExportTextBlobForLocale(sum));
  }

  /**
   * Heuristic: Portuguese (pt-BR) {@code msinfo32} export — must be checked before Spanish (similar Latin).
   * @param {NonNullable<ReturnType<typeof extractSystemSummary>>} sum
   */
  function msinfoExportLooksPortuguese(sum) {
    return looksLikePortugueseWindowsLatinHint(msinfoExportTextBlobForLocale(sum));
  }

  /**
   * Heuristic: Ukrainian (uk-UA) {@code msinfo32} export — Cyrillic; distinct paths/tags vs Russian.
   * @param {NonNullable<ReturnType<typeof extractSystemSummary>>} sum
   */
  function msinfoExportLooksUkrainian(sum) {
    return looksLikeUkrainianWindowsCyrillicHint(msinfoExportTextBlobForLocale(sum));
  }

  /**
   * {@code <dt>} label: always English by default (values can still be toggled via Translate).
   * @param {string} enLabel
   * @param {string} esLabel
   * @param {string} frLabel
   * @param {"es" | "fr" | "pt" | "tr" | "uk" | null} summaryLoc
   * @param {(s: string) => string} escFn
   * @param {{ forceI18nSpan?: boolean } | undefined} i18nOpts
   */
  function summaryDlDtLabel(enLabel, esLabel, frLabel, summaryLoc, escFn, i18nOpts) {
    void esLabel;
    void frLabel;
    void summaryLoc;
    void i18nOpts;
    return `<dt>${escFn(enLabel)}</dt>`;
  }

  /**
   * @param {HTMLElement} el
   * @param {ReturnType<typeof extractSystemSummary> | null} sum
   * @param {boolean} ok
   * @param {string[]=} repairNotes
   * @param {string[]=} msinfoXmlRepairs messages from {@link parseMsInfoDocument} in-memory XML repair
   * @param {{ kind: string, summary: string, suggestedTab: string | null }=} nonMsinfoInfo
   *   When the file is not MSInfo at all, renders an explanatory card instead of the generic failure
   *   message and offers a button to switch to the matching tab when one applies.
   */
  function renderSystemSummary(el, sum, ok, repairNotes, msinfoXmlRepairs, nonMsinfoInfo) {
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
      const info = nonMsinfoInfo || null;
      const labelByTab = {
        bsod: "BSOD & WinDbg",
        gpu: "GPU-Z logs",
        evtx: "Event Viewer",
        dxdiag: "DxDiag",
        system: "System Information",
      };
      const targetPanelId = info && info.suggestedTab && info.suggestedTab !== "system"
        ? `tool-panel-${info.suggestedTab === "evtx" ? "evtx" : info.suggestedTab}`
        : "";
      const switchBtn =
        targetPanelId && info && info.suggestedTab && labelByTab[/** @type {string} */ (info.suggestedTab)]
          ? `<p class="non-msinfo-card__actions"><a class="report-pri-btn" href="#${esc(targetPanelId)}">Open the ${esc(labelByTab[/** @type {string} */ (info.suggestedTab)])} tab</a></p>`
          : "";
      const detectedKindCard = info
        ? `<section class="non-msinfo-card" role="status" aria-labelledby="non-msinfo-title" style="margin-bottom:1rem;border:1px solid rgba(118,185,0,0.35);border-radius:10px;padding:1rem 1.15rem;background:rgba(118,185,0,0.05);">
              <h3 id="non-msinfo-title" style="margin:0 0 .35rem;font-size:1.05rem;color:var(--accent-strong, #76b900);">Detected file type: ${esc(info.summary)}</h3>
              <p style="margin:0 0 .5rem;color:var(--muted);font-size:.9rem;line-height:1.5;">The viewer reads MSInfo (msinfo32) exports here. The file you loaded was something else — see the recovery notes above for details and what to do next.</p>
              ${switchBtn}
           </section>`
        : "";
      el.innerHTML =
        xmlRepairBanner +
        detectedKindCard +
        recoveryBanner +
        '<p class="summary-empty">Could not build a structured summary from this file. Open <strong>Raw export</strong> below, try a different encoding, export a fresh <code>.nfo</code> from msinfo32, or use <strong>Copy repaired XML</strong> if it appears after a partial fix.</p>';
      return;
    }

    const frHit = msinfoExportLooksFrench(sum);
    const turkishExport = !frHit && msinfoExportLooksTurkish(sum);
    const portugueseExport = !frHit && !turkishExport && msinfoExportLooksPortuguese(sum);
    const spanishExport = !frHit && !turkishExport && !portugueseExport && msinfoExportLooksSpanish(sum);
    const ukrainianExport =
      !frHit && !turkishExport && !portugueseExport && !spanishExport && msinfoExportLooksUkrainian(sum);
    const summaryLoc = frHit
      ? "fr"
      : turkishExport
        ? "tr"
        : portugueseExport
          ? "pt"
          : spanishExport
            ? "es"
            : ukrainianExport
              ? "uk"
              : null;
    /** When the export is localized (incl. Ukrainian Cyrillic), force {@code .sum-i18n} on values so section Translate can update cells. */
    const summaryLblOpts = /** @type {{ forceI18nSpan: true }} */ ({ forceI18nSpan: true });
    const sumI18nSummary = summaryLoc ? summaryLblOpts : undefined;

    /** When the export is non-English (Cyrillic, Spanish, French, …) flip every section to English by default. */
    const defaultTranslateOn = !!summaryLoc;
    const mbBiosBody = renderMotherboardBiosBody(sum, esc, { forceI18nSpan: true });
    const mbBiosHtml = renderReportCategoryAccordion("Motherboard & BIOS", mbBiosBody, esc, {
      icon: "mb",
      alwaysOfferTranslate: true,
      defaultTranslateOn,
    });

    const gpuCount = Array.isArray(sum.graphics?.adapters)
      ? sum.graphics.adapters.filter((a) => a && typeof a === "object" && hasGpuCardContent(/** @type {Record<string, unknown>} */ (a))).length
      : 0;
    /** Always offer Translate when any GPU card is shown — Spanish/Portuguese strings are often ASCII-only ({@code compatible con}, {@code No disponible}) and skip heuristic detection. */
    const gpuI18nOpts = gpuCount > 0 ? { forceI18nSpan: true } : undefined;
    const gpuDashboardEmbed = renderGpuDashboard(sum.graphics, esc, true, gpuI18nOpts);
    const problemDevicesHtml = renderProblemDevicesPanel(sum.problems, esc);

    const netNeedsI18n = networkSectionNeedsTranslateHint(sum.networkAdapters);
    const netI18nOpts =
      sum.networkAdapters && sum.networkAdapters.length ? { forceI18nSpan: true } : undefined;
    let netBody = "";
    if (sum.networkAdapters && sum.networkAdapters.length) {
      netBody = `<p class="summary-lede">Shows adapters with a usable IPv4 and/or global IPv6, and either DNS resolvers in the file or a routable default gateway / DHCP server (MSInfo often omits DNS when DHCP provides it). Bluetooth and similar are omitted.</p><ul class="network-adapters">${sum.networkAdapters
        .map((a) => {
          const det = a.details
            .map(
              (d) =>
                `<div class="network-detail"><span class="network-detail__k">${sumI18nSpan(d.k, esc, undefined, netI18nOpts)}</span><span class="network-detail__v network-wrap">${sumI18nSpan(d.v, esc, undefined, netI18nOpts)}</span></div>`
            )
            .join("");
          return `<li class="network-adapter">
            <div class="network-adapter__name">${sumI18nSpan(a.name, esc, undefined, netI18nOpts)}</div>
            <div class="network-adapter__meta"><span class="muted-label">Medium</span> ${sumI18nSpan(a.medium, esc, undefined, netI18nOpts)}</div>
            <div class="network-adapter__meta"><span class="muted-label">IPv4</span> <span class="network-wrap">${sumI18nSpan(a.ipv4Display, esc, undefined, netI18nOpts)}</span></div>
            <div class="network-adapter__meta"><span class="muted-label">IPv6 address(es)</span> <span class="network-wrap">${sumI18nSpan(a.ipv6Display, esc, undefined, netI18nOpts)}</span></div>
            <div class="network-adapter__meta"><span class="muted-label">IPv6 status</span> ${sumI18nSpan(a.ipv6.summary, esc, undefined, netI18nOpts)}</div>
            <div class="network-adapter__details">${det}</div>
          </li>`;
        })
        .join("")}</ul>`;
    } else if (Array.isArray(sum.allNetworkAdapters) && sum.allNetworkAdapters.length) {
      /** Fallback: surface every {@code Components → Network → Adapter} entry, prioritising those that DO have an IPv4/IPv6 in the export (so localized exports never hide active adapters). */
      const fallbackHasAddr = sum.allNetworkAdapters.some(
        (a) => (a.ipv4 && /\d+\.\d+\.\d+\.\d+/.test(a.ipv4)) || (a.ipv6 && a.ipv6.length > 2)
      );
      const intro = fallbackHasAddr
        ? `<p class="summary-lede">Active adapters from <strong>Components → Network → Adapter</strong>: every adapter with an IPv4 / IPv6 in the export is listed first.</p>`
        : `<p class="summary-lede">No adapter in this export reported a usable IPv4 / IPv6 — showing the raw entries from <strong>Components → Network → Adapter</strong>. Open MSInfo on the live system for current addresses.</p>`;
      const sortedAdapters = sum.allNetworkAdapters.slice().sort((a, b) => {
        const ah = (a.ipv4 && /\d+\.\d+\.\d+\.\d+/.test(a.ipv4)) || (a.ipv6 && a.ipv6.length > 2) ? 1 : 0;
        const bh = (b.ipv4 && /\d+\.\d+\.\d+\.\d+/.test(b.ipv4)) || (b.ipv6 && b.ipv6.length > 2) ? 1 : 0;
        return bh - ah;
      });
      netBody = `${intro}<ul class="network-adapters">${sortedAdapters
        .map((a) => {
          const name = String(a.name || "(unnamed adapter)");
          const productType = String(a.productType || "");
          const dhcpEnabled = String(a.dhcpEnabled || "");
          const macAddr = String(a.macAddress || "");
          const serviceName = String(a.serviceName || "");
          const ipv4 = String(a.ipv4 || "");
          const ipv6 = String(a.ipv6 || "");
          const gateway = String(a.gateway || "");
          const dhcpServer = String(a.dhcpServer || "");
          const subnet = String(a.subnet || "");
          const meta = [
            productType ? `<div class="network-adapter__meta"><span class="muted-label">Product type</span> <span>${sumI18nSpan(productType, esc, undefined, netI18nOpts)}</span></div>` : "",
            ipv4 ? `<div class="network-adapter__meta"><span class="muted-label">IPv4</span> <span class="network-wrap">${sumI18nSpan(ipv4, esc, undefined, netI18nOpts)}</span></div>` : "",
            ipv6 ? `<div class="network-adapter__meta"><span class="muted-label">IPv6 address(es)</span> <span class="network-wrap">${sumI18nSpan(ipv6, esc, undefined, netI18nOpts)}</span></div>` : "",
            subnet ? `<div class="network-adapter__meta"><span class="muted-label">Subnet</span> <span class="network-wrap">${sumI18nSpan(subnet, esc, undefined, netI18nOpts)}</span></div>` : "",
            gateway ? `<div class="network-adapter__meta"><span class="muted-label">Default gateway</span> <span class="network-wrap">${sumI18nSpan(gateway, esc, undefined, netI18nOpts)}</span></div>` : "",
            dhcpServer ? `<div class="network-adapter__meta"><span class="muted-label">DHCP server</span> <span>${sumI18nSpan(dhcpServer, esc, undefined, netI18nOpts)}</span></div>` : "",
            macAddr ? `<div class="network-adapter__meta"><span class="muted-label">MAC address</span> <span>${esc(macAddr)}</span></div>` : "",
            dhcpEnabled ? `<div class="network-adapter__meta"><span class="muted-label">DHCP enabled</span> <span>${sumI18nSpan(dhcpEnabled, esc, undefined, netI18nOpts)}</span></div>` : "",
            serviceName ? `<div class="network-adapter__meta"><span class="muted-label">Service name</span> <span>${esc(serviceName)}</span></div>` : "",
          ]
            .filter(Boolean)
            .join("");
          return `<li class="network-adapter">
            <div class="network-adapter__name">${sumI18nSpan(name, esc, undefined, netI18nOpts)}</div>
            ${meta}
          </li>`;
        })
        .join("")}</ul>`;
    } else {
      netBody =
        '<p class="summary-empty">No matching adapters (usable IPv4 or global IPv6, plus DNS or gateway/DHCP server in the export). Bluetooth and PAN are ignored.</p>';
    }

    const overviewBody = `<dl class="system-summary-dl">
      ${summaryDlDtLabel("System Type", "Tipo de sistema", "Type du système", summaryLoc, esc, summaryLblOpts)}<dd>${sumI18nSpan(sum.systemTypeRaw, esc, undefined, sumI18nSummary)}</dd>
      ${summaryDlDtLabel("Processor", "Procesador", "Processeur", summaryLoc, esc, summaryLblOpts)}<dd class="system-summary-dd--wrap">${sumI18nSpan(sum.processor, esc, undefined, sumI18nSummary)}</dd>
      ${summaryDlDtLabel("Platform Role", "Rol de plataforma", "Rôle de la plateforme", summaryLoc, esc, summaryLblOpts)}<dd>${sumI18nSpan(sum.platformRole, esc, undefined, sumI18nSummary)}</dd>
      ${summaryDlDtLabel("Time Zone", "Zona horaria", "Fuseau horaire", summaryLoc, esc, summaryLblOpts)}<dd>${sumI18nSpan(sum.timeZone, esc, undefined, sumI18nSummary)}</dd>
      ${summaryDlDtLabel("Classification", "Clasificación", "Catégorie d'appareil", summaryLoc, esc, summaryLblOpts)}<dd>${sumI18nSpan(sum.systemForm, esc, undefined, sumI18nSummary)}</dd>
    </dl>`;
    const overviewHtml = renderReportCategoryAccordion("System Overview", overviewBody, esc, {
      open: true,
      icon: "system",
      alwaysOfferTranslate: true,
      defaultTranslateOn,
    });

    const mem = sum.memory || {};
    const memoryBody = `<dl class="system-summary-dl">
      ${summaryDlDtLabel("Installed Physical Memory (RAM)", "Memoria física instalada (RAM)", "Mémoire physique (RAM) installée", summaryLoc, esc, summaryLblOpts)}<dd>${sumI18nSpan(mem.installedRam, esc, undefined, sumI18nSummary)}</dd>
      ${summaryDlDtLabel("Total Physical Memory", "Memoria física total", "Mémoire physique totale", summaryLoc, esc, summaryLblOpts)}<dd>${sumI18nSpan(mem.totalPhysical, esc, undefined, sumI18nSummary)}</dd>
      ${summaryDlDtLabel("Available Physical Memory", "Memoria física disponible", "Mémoire physique disponible", summaryLoc, esc, summaryLblOpts)}<dd>${sumI18nSpan(mem.availablePhysical, esc, undefined, sumI18nSummary)}</dd>
      ${summaryDlDtLabel("Total Virtual Memory", "Memoria virtual total", "Mémoire virtuelle totale", summaryLoc, esc, summaryLblOpts)}<dd>${sumI18nSpan(mem.totalVirtual, esc, undefined, sumI18nSummary)}</dd>
      ${summaryDlDtLabel("Available Virtual Memory", "Memoria virtual disponible", "Mémoire virtuelle disponible", summaryLoc, esc, summaryLblOpts)}<dd>${sumI18nSpan(mem.availableVirtual, esc, undefined, sumI18nSummary)}</dd>
      ${summaryDlDtLabel("Page File Space", "Espacio del archivo de paginación", "Espace actuel du fichier d'échange", summaryLoc, esc, summaryLblOpts)}<dd>${sumI18nSpan(mem.pageFileSpace, esc, undefined, sumI18nSummary)}</dd>
      ${summaryDlDtLabel("Page File Location(s)", "Ubicación del archivo de paginación", "Emplacement du fichier d'échange", summaryLoc, esc, summaryLblOpts)}<dd class="system-summary-dd--wrap">${sumI18nSpan(mem.pageFileLocation, esc, undefined, sumI18nSummary)}</dd>
    </dl>`;
    const memoryHtml = renderReportCategoryAccordion("Memory Information", memoryBody, esc, {
      icon: "memory",
      alwaysOfferTranslate: !!summaryLoc,
      defaultTranslateOn,
    });

    const storageDrives = sum.storageDrives || [];
    const storageEmpty = `<p class="summary-empty">No disk or volume details found in this export (look for <strong>Components → Storage → Disks</strong> in MSInfo).</p>`;
    const storageBody =
      storageDrives.length > 0
        ? `<div class="system-ext-stack">${storageDrives
            .map(
              (d) => `<article class="system-storage-card"><h4 class="system-storage-card__title">${sumI18nSpan(d.title, esc, undefined, sumI18nSummary)}</h4>
      <dl class="system-summary-dl system-summary-dl--compact">
        ${summaryDlDtLabel("File System", "Sistema de archivos", "Système de fichiers", summaryLoc, esc, summaryLblOpts)}<dd>${sumI18nSpan(d.fileSystem, esc, undefined, sumI18nSummary)}</dd>
        ${summaryDlDtLabel("Total Size", "Tamaño total", "Taille totale", summaryLoc, esc, summaryLblOpts)}<dd class="system-summary-dd--wrap">${sumI18nSpan(d.totalSize, esc, undefined, sumI18nSummary)}</dd>
        ${summaryDlDtLabel("Free Space", "Espacio libre", "Espace libre", summaryLoc, esc, summaryLblOpts)}<dd class="system-summary-dd--wrap">${sumI18nSpan(d.freeSpace, esc, undefined, sumI18nSummary)}</dd>
        ${summaryDlDtLabel("Used", "Espacio usado", "Espace utilisé", summaryLoc, esc, summaryLblOpts)}<dd>${sumI18nSpan(d.used, esc, undefined, sumI18nSummary)}</dd>
        ${summaryDlDtLabel("Volume Name", "Nombre de volumen", "Nom du volume", summaryLoc, esc, summaryLblOpts)}<dd>${
          d.volumeName && String(d.volumeName).trim()
            ? sumI18nSpan(d.volumeName, esc, undefined, sumI18nSummary)
            : `<em class="summary-empty-inline">Not provided in this export</em>`
        }</dd>
        ${summaryDlDtLabel("Serial Number", "Número de serie", "Numéro de série", summaryLoc, esc, summaryLblOpts)}<dd>${sumI18nSpan(d.serialNumber, esc, undefined, sumI18nSummary)}</dd>
      </dl></article>`
            )
            .join("")}</div>`
        : storageEmpty;
    const storageHtml = renderReportCategoryAccordion("Storage Drives", storageBody, esc, {
      count: storageDrives.length || null,
      icon: "disk",
      alwaysOfferTranslate: !!summaryLoc,
      defaultTranslateOn,
    });

    const startups = sum.startupPrograms || [];
    /**
     * Wrap headers in {@link sumI18nSpan} so non-English exports can flip them with the section toggle.
     * Default-translate-on sections render in English; pressing {@code Original} swaps headers back.
     */
    const startupHeadOpts = summaryLoc ? /** @type {{ forceI18nSpan: true }} */ ({ forceI18nSpan: true }) : undefined;
    const _startupHead = spanishExport
      ? `<thead><tr><th scope="col">${sumI18nSpan("Nombre", esc, "Name", startupHeadOpts)}</th><th scope="col">${sumI18nSpan("Comando", esc, "Command", startupHeadOpts)}</th><th scope="col">${sumI18nSpan("Ubicación", esc, "Location", startupHeadOpts)}</th><th scope="col">${sumI18nSpan("Usuario", esc, "User", startupHeadOpts)}</th></tr></thead>`
      : portugueseExport
        ? `<thead><tr><th scope="col">${sumI18nSpan("Nome", esc, "Name", startupHeadOpts)}</th><th scope="col">${sumI18nSpan("Comando", esc, "Command", startupHeadOpts)}</th><th scope="col">${sumI18nSpan("Localização", esc, "Location", startupHeadOpts)}</th><th scope="col">${sumI18nSpan("Usuário", esc, "User", startupHeadOpts)}</th></tr></thead>`
        : ukrainianExport
          ? `<thead><tr><th scope="col">${sumI18nSpan("Ім'я", esc, "Name", startupHeadOpts)}</th><th scope="col">${sumI18nSpan("Команда", esc, "Command", startupHeadOpts)}</th><th scope="col">${sumI18nSpan("Розташування", esc, "Location", startupHeadOpts)}</th><th scope="col">${sumI18nSpan("Користувач", esc, "User", startupHeadOpts)}</th></tr></thead>`
          : `<thead><tr><th scope="col">Name</th><th scope="col">Command</th><th scope="col">Location</th><th scope="col">User</th></tr></thead>`;
    const startupBody =
      startups.length > 0
        ? `<div class="system-ext-scroll"><table class="system-ext-table" aria-label="Startup programs">${_startupHead}<tbody>${startups
            .map(
              (s) =>
                `<tr><td class="system-ext-td-name">${sumI18nSpan(s.name, esc)}</td><td class="system-summary-dd--wrap">${sumI18nSpan(s.command, esc)}</td><td class="system-summary-dd--wrap">${sumI18nSpan(s.location, esc)}</td><td>${sumI18nSpan(s.user, esc)}</td></tr>`
            )
            .join("")}</tbody></table></div>`
        : `<p class="summary-empty">No startup program entries found (export may omit <strong>Software Environment → Startup Programs</strong>).</p>`;
    const startupHtml = renderReportCategoryAccordion("Startup Applications", startupBody, esc, {
      count: startups.length || null,
      icon: "startup",
      alwaysOfferTranslate: !!summaryLoc,
      defaultTranslateOn,
    });

    const svcAll = sum.servicesAll || [];
    const runningList = sum.runningServices || [];
    const svcNeedsI18n = svcAll.some((s) =>
      localeScriptLooksNonEnglishListed(`${s.name} ${s.state} ${s.startMode}`)
    );
    const svcOfferTranslate = svcAll.length > 0 || runningList.length > 0;
    const svcI18nOpts =
      svcOfferTranslate || svcNeedsI18n ? { forceI18nSpan: true } : undefined;
    /**
     * Each header is wrapped via {@code sumI18nSpan(rawCyrillic, esc, "English", opts)} so:
     *   1. the visible text is English by default (matches "Default Translate ON" for non-English exports);
     *   2. clicking {@code Original} restores the source-language string from {@code data-i18n-enc}.
     */
    const svcTableHead =
      spanishExport && svcI18nOpts
        ? `<thead><tr><th scope="col">${sumI18nSpan("Nombre", esc, "Name", svcI18nOpts)}</th><th scope="col">${sumI18nSpan("Estado", esc, "State", svcI18nOpts)}</th><th scope="col">${sumI18nSpan("Tipo de inicio", esc, "Startup type", svcI18nOpts)}</th></tr></thead>`
        : portugueseExport && svcI18nOpts
          ? `<thead><tr><th scope="col">${sumI18nSpan("Nome", esc, "Name", svcI18nOpts)}</th><th scope="col">${sumI18nSpan("Estado", esc, "State", svcI18nOpts)}</th><th scope="col">${sumI18nSpan("Tipo de inicialização", esc, "Startup type", svcI18nOpts)}</th></tr></thead>`
          : ukrainianExport && svcI18nOpts
            ? `<thead><tr><th scope="col">${sumI18nSpan("Назва", esc, "Name", svcI18nOpts)}</th><th scope="col">${sumI18nSpan("Стан", esc, "State", svcI18nOpts)}</th><th scope="col">${sumI18nSpan("Тип запуску", esc, "Startup type", svcI18nOpts)}</th></tr></thead>`
            : `<thead><tr><th scope="col">Name</th><th scope="col">State</th><th scope="col">Startup type</th></tr></thead>`;
    const svcRows = (list) =>
      list.length > 0
        ? `<div class="system-ext-scroll"><table class="system-ext-table" aria-label="${esc("Services")}">${svcTableHead}<tbody>${list
            .map(
              (s) =>
                `<tr><td class="system-ext-td-name">${sumI18nSpanWithAlt(s.name, esc, s.keyName, svcI18nOpts)}</td><td>${sumI18nSpan(s.state, esc, undefined, svcI18nOpts)}</td><td>${sumI18nSpan(s.startMode, esc, undefined, svcI18nOpts)}</td></tr>`
            )
            .join("")}</tbody></table></div>`
        : `<p class="summary-empty">No service rows found.</p>`;
    const servicesEmpty = `<p class="summary-empty">No service rows found.</p>`;
    const servicesBody = svcAll.length > 0 ? svcRows(svcAll) : servicesEmpty;
    const servicesHtml = renderReportCategoryAccordion("Services", servicesBody, esc, {
      count: svcAll.length || null,
      icon: "services",
      alwaysOfferTranslate: svcOfferTranslate,
      defaultTranslateOn,
    });
    const servicesRunMsg = `<p class="summary-empty">No Windows <strong>Services</strong> rows matched a running state (including localized text such as <em>Em execução</em>, <em>Çalışıyor</em>, <em>Виконується</em>, <em>Выполняется</em>, <em>Работает</em>, <em>Запущена</em>, or <em>RUNNING</em>). Only <strong>Software Environment → Services</strong> is used here — the <strong>Running Tasks</strong> / <strong>Выполняющиеся задачи</strong> process list is a different MSInfo section.</p>`;
    const runningBody = runningList.length > 0 ? svcRows(runningList) : servicesRunMsg;
    const runningHtml = renderReportCategoryAccordion("Running Services", runningBody, esc, {
      count: runningList.length || null,
      icon: "running",
      alwaysOfferTranslate: svcOfferTranslate,
      defaultTranslateOn,
    });

    const wer = sum.windowsErrorReports || [];
    const werNeedsI18n = wer.length > 0;
    const werBody = renderWindowsErrorReportsBody(
      wer,
      esc,
      werNeedsI18n ? { forceI18nSpan: true } : undefined
    );
    const werHtml = renderReportCategoryAccordion("Windows Error Reports", werBody, esc, {
      count: wer.length || null,
      icon: "wer",
      alwaysOfferTranslate: werNeedsI18n,
      defaultTranslateOn,
    });

    const os = sum.os || { name: "", versionLine: "", build: "", installDate: "" };
    const osDl = `<dl class="system-summary-dl">
      ${summaryDlDtLabel("OS Name", "Nombre del SO", "Nom du système d'exploitation", summaryLoc, esc, summaryLblOpts)}<dd>${sumI18nSpan(os.name, esc, undefined, sumI18nSummary)}</dd>
      ${summaryDlDtLabel("Version", "Versión", "Version", summaryLoc, esc, summaryLblOpts)}<dd class="system-summary-dd--wrap">${sumI18nSpan(os.versionLine, esc, undefined, sumI18nSummary)}</dd>
      ${summaryDlDtLabel("Build", "Compilación", "Build", summaryLoc, esc, summaryLblOpts)}<dd>${sumI18nSpan(os.build, esc, undefined, sumI18nSummary)}</dd>
      ${summaryDlDtLabel("Original Install Date", "Fecha de instalación original", "Date d'installation d'origine", summaryLoc, esc, summaryLblOpts)}<dd>${sumI18nSpan(os.installDate, esc, undefined, sumI18nSummary)}</dd>
    </dl>`;
    const osBody = `${osDl}${renderWindowsUpdatesOsEmbed(sum, esc)}`;
    const osHtml = renderReportCategoryAccordion("OS Information", osBody, esc, {
      icon: "os",
      alwaysOfferTranslate: true,
      defaultTranslateOn,
    });

    const recHtml = renderReportCategoryAccordion("Recommendations & Updates", renderRecommendationsCard(sum, true), esc, {
      icon: "rec",
    });
    const gpuHtml = renderReportCategoryAccordion("Graphics (GPU)", gpuDashboardEmbed, esc, {
      count: gpuCount || null,
      icon: "gpu",
      open: true,
      alwaysOfferTranslate: gpuCount > 0,
      defaultTranslateOn,
    });
    const netCount =
      (Array.isArray(sum.networkAdapters) ? sum.networkAdapters.length : 0) ||
      (Array.isArray(sum.allNetworkAdapters) ? sum.allNetworkAdapters.length : 0);
    const networkHtml = renderReportCategoryAccordion("Network (Internet)", netBody, esc, {
      count: netCount || null,
      icon: "network",
      alwaysOfferTranslate:
        !!(sum.networkAdapters && sum.networkAdapters.length) ||
        !!(sum.allNetworkAdapters && sum.allNetworkAdapters.length),
      defaultTranslateOn,
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
    /** Pre-translate sections marked {@code data-default-translate="1"} so non-English exports show English up-front. */
    applyDefaultSectionTranslate(el);
  }

  /**
   * Walks {@code .report-category__i18n-root[data-default-translate="1"]} and replaces each
   * {@code .sum-i18n} span text with its offline-translated English where available.
   * @param {HTMLElement | Element | null | undefined} root
   */
  function applyDefaultSectionTranslate(root) {
    if (!root || !root.querySelectorAll) return;
    const sections = root.querySelectorAll(".report-category__i18n-root[data-default-translate='1']");
    sections.forEach((section) => {
      section.querySelectorAll(".sum-i18n").forEach((span) => {
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
        if (!raw) return;
        const tEn = translateExportValueToEnglish(raw);
        if (tEn && tEn !== raw) {
          span.textContent = tEn;
        } else {
          const alt = span.getAttribute("data-alt-en") || "";
          if (alt) span.textContent = alt;
        }
      });
    });
  }

  /**
   * Suffix `id` / ARIA list attributes in a cloned report fragment so the compare view does not clash with the main panel.
   * @param {Element} root
   * @param {string} suffix
   */
  function suffixDomIdAttributes(root, suffix) {
    if (!suffix) return;
    root.querySelectorAll("[id]").forEach((el) => {
      if (el.id) el.id = el.id + suffix;
    });
    root.querySelectorAll("label[for]").forEach((el) => {
      if (el instanceof HTMLLabelElement && el.htmlFor) el.htmlFor = el.htmlFor + suffix;
    });
    for (const attr of ["aria-labelledby", "aria-owns", "aria-describedby"]) {
      root.querySelectorAll(`[${attr}]`).forEach((el) => {
        const v = el.getAttribute(attr);
        if (v) {
          el.setAttribute(
            attr,
            v
              .split(/\s+/)
              .filter(Boolean)
              .map((t) => t + suffix)
              .join(" "),
          );
        }
      });
    }
  }

  /**
   * Stacked report: for each section (System Overview, Memory, …) show the full file 1 card, then the full file 2 card.
   * @param {HTMLElement} out
   * @param {string} nameA
   * @param {string} nameB
   * @param {ReturnType<typeof extractSystemSummary> | null} sumA
   * @param {ReturnType<typeof extractSystemSummary> | null} sumB
   * @param {string[]} recNotesA
   * @param {string[]} recNotesB
   * @param {string[]} xmlRepA
   * @param {string[]} xmlRepB
   */
  function buildSystemCompareStackedView(out, nameA, nameB, sumA, sumB, recNotesA, recNotesB, xmlRepA, xmlRepB) {
    out.textContent = "";
    const wrap = document.createElement("div");
    wrap.className = "system-compare-paired system-compare-paired--stacked";
    const runU = `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const hostA = document.createElement("div");
    const hostB = document.createElement("div");
    const na = Array.isArray(recNotesA) ? recNotesA : [];
    const nb = Array.isArray(recNotesB) ? recNotesB : [];
    renderSystemSummary(hostA, sumA, !!sumA, na, xmlRepA);
    renderSystemSummary(hostB, sumB, !!sumB, nb, xmlRepB);
    const listA = hostA.querySelectorAll(".system-summary-stack .report-category");
    const listB = hostB.querySelectorAll(".system-summary-stack .report-category");
    if (listA.length === 0 && listB.length === 0) {
      const p = document.createElement("p");
      p.className = "system-compare-report__warn";
      p.textContent = "Could not build report sections for either file. Try Raw line diff, Encoding, or a fresh .nfo from msinfo32.";
      wrap.appendChild(p);
      out.appendChild(wrap);
      return 0;
    }
    if (listA.length !== listB.length) {
      const p = document.createElement("p");
      p.className = "system-compare-paired__mismatch";
      p.setAttribute("role", "status");
      p.textContent = `The two reports have a different number of sections (file 1: ${listA.length}, file 2: ${listB.length}). Showing the first ${Math.min(listA.length, listB.length)} section groups in order.`;
      wrap.appendChild(p);
    }
    const n = Math.min(listA.length, listB.length);
    for (let i = 0; i < n; i++) {
      const secA = /** @type {HTMLElement} */ (listA[i]);
      const secB = /** @type {HTMLElement} */ (listB[i]);
      const titleEl = secA.querySelector(".report-category__summary-text");
      const title = titleEl && titleEl.textContent ? titleEl.textContent.replace(/\s+/g, " ").trim() : `Section ${i + 1}`;
      const pair = document.createElement("div");
      pair.className = "system-compare-stack__pair";
      pair.setAttribute("data-compare-section", title);
      const suffA = `-${runU}-a${i}`;
      const suffB = `-${runU}-b${i}`;
      const kickerA = document.createElement("p");
      kickerA.className = "system-compare-stack__kicker system-compare-stack__kicker--1";
      kickerA.textContent = `File 1 · ${nameA}`;
      const kickerB = document.createElement("p");
      kickerB.className = "system-compare-stack__kicker system-compare-stack__kicker--2";
      kickerB.textContent = `File 2 · ${nameB}`;
      const cA = /** @type {HTMLElement} */ (secA.cloneNode(true));
      suffixDomIdAttributes(cA, suffA);
      const cB = /** @type {HTMLElement} */ (secB.cloneNode(true));
      suffixDomIdAttributes(cB, suffB);
      pair.appendChild(kickerA);
      pair.appendChild(cA);
      pair.appendChild(kickerB);
      pair.appendChild(cB);
      wrap.appendChild(pair);
    }
    out.appendChild(wrap);
    return n;
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
    /** @type {ReturnType<typeof createLanguageAdderSnapshot> | null} */
    let lastLangAdder = null;

    // Language Adder for BSOD tab.
    let btnLangAdder = null;
    if (toolbar) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn btn--ghost btn-lang-adder";
      b.textContent = "Language Adder";
      b.title = "Export unknown (untranslated) tokens to extend offline language support";
      b.disabled = true;
      b.addEventListener("click", () => {
        if (!lastLangAdder) {
          window.alert("Load and analyze a file (or paste text) first.");
          return;
        }
        const fb = (fileState?.name || "bsod").replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 80);
        const base = languageAdderExportBasename(lastLangAdder, fb);
        downloadTextAsFile(`${base}.language-adder.txt`, buildLanguageAdderTxtFromSnapshot(lastLangAdder), "text/plain;charset=utf-8");
      });
      toolbar.appendChild(b);
      btnLangAdder = b;
    }

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
      try {
        // Tokenize lightly: words + common Windows phrases.
        const toks = String(t || "")
          .split(/[\r\n\t]+/g)
          .flatMap((ln) => ln.split(/[•·]| {2,}/g))
          .map((x) => x.trim())
          .filter(Boolean)
          .slice(0, 4000);
        lastLangAdder = createLanguageAdderSnapshot({
          fileName: fileState?.name || "Pasted",
          encodingLabel: "auto",
          source: "bsod",
          tokens: toks,
        });
        if (btnLangAdder) btnLangAdder.disabled = Object.keys(lastLangAdder.unknownTokens || {}).length === 0;
      } catch {
        lastLangAdder = null;
        if (btnLangAdder) btnLangAdder.disabled = true;
      }
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

  /** Max data rows kept after uniform subsampling (GPU-Z logs can exceed millions of lines). */
  const GPU_SENSOR_PARSE_MAX_ROWS = 100000;
  /** Max polyline points per chart series (canvas path cost grows quickly after this). */
  const GPU_SENSOR_CHART_MAX_POINTS = 14000;

  /** First CSV cell is typically GPU-Z "Date" / time column. */
  function parseSensorTimestampMs(cell) {
    const s = String(cell || "").replace(/^"|"$/g, "").trim();
    if (!s) return null;
    const iso = s.replace(/^(\d{4}-\d{2}-\d{2})\s+/, "$1T");
    const d = Date.parse(iso);
    if (!Number.isNaN(d)) return d;
    const d2 = Date.parse(s);
    return Number.isNaN(d2) ? null : d2;
  }

  /**
   * Walk text: first non-empty = header; count data lines; capture first/last data line (full-file bounds, not subsampled).
   * @param {string} text
   */
  function gpuSensorWalkHeaderAndCount(text) {
    const len = text.length;
    let pos = 0;
    /** @type {string | null} */
    let headerRaw = null;
    let dataLineCount = 0;
    /** @type {string | null} */
    let firstDataLine = null;
    /** @type {string | null} */
    let lastDataLine = null;
    while (pos < len) {
      const nl = text.indexOf("\n", pos);
      const end = nl === -1 ? len : nl;
      let line = text.slice(pos, end);
      pos = nl === -1 ? len : nl + 1;
      if (line.endsWith("\r")) line = line.slice(0, -1);
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (headerRaw === null) {
        headerRaw = trimmed;
        continue;
      }
      dataLineCount++;
      if (firstDataLine === null) firstDataLine = trimmed;
      lastDataLine = trimmed;
    }
    if (!headerRaw || dataLineCount === 0) return null;
    return { headerLine: headerRaw, dataLineCount, firstDataLine, lastDataLine };
  }

  /**
   * Collect CSV rows using uniform stride (only non-empty data lines after header).
   * @param {string} text
   * @param {number} stride >= 1
   */
  function gpuSensorCollectRows(text, stride) {
    const len = text.length;
    let pos = 0;
    /** @type {string | null} */
    let headerRaw = null;
    let di = 0;
    /** @type {string[][]} */
    const rows = [];
    while (pos < len) {
      const nl = text.indexOf("\n", pos);
      const end = nl === -1 ? len : nl;
      let line = text.slice(pos, end);
      pos = nl === -1 ? len : nl + 1;
      if (line.endsWith("\r")) line = line.slice(0, -1);
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (headerRaw === null) {
        headerRaw = trimmed;
        continue;
      }
      if (di % stride === 0) {
        rows.push(splitCsvLine(trimmed));
      }
      di++;
    }
    return rows;
  }

  /**
   * @param {string} text
   * @returns {{ headers: string[], rows: string[][], rowCount: number, numericCols: { index: number, name: string, unit: string, pts: { r: number, v: number, t: number | null }[], min: number, max: number }[], truncated?: boolean, originalDataRows?: number, rowStride?: number, timeRange?: { startRaw: string, endRaw: string, startMs: number | null, endMs: number | null, timeColumnLabel: string } } | null}
   */
  function parseSensorCsv(text) {
    const walk = gpuSensorWalkHeaderAndCount(text);
    if (!walk) return null;
    const { headerLine, dataLineCount, firstDataLine, lastDataLine } = walk;
    const headers = splitCsvLine(normalizeSensorHeaderLabel(headerLine)).map((h) => normalizeSensorHeaderLabel(h));
    if (headers.length < 2) return null;

    const stride = Math.max(1, Math.ceil(dataLineCount / GPU_SENSOR_PARSE_MAX_ROWS));
    const rows = gpuSensorCollectRows(text, stride);
    const rowCount = rows.length;
    if (rowCount < 1) return null;

    const colCount = headers.length;
    /** @type {{ index: number, name: string, unit: string, pts: { r: number, v: number, t: number | null }[], min: number, max: number }[]} */
    const numericCols = [];

    /** @param {string} cell */
    function parseTime(cell) {
      const ms = parseSensorTimestampMs(cell);
      return ms;
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
        let min = Infinity;
        let max = -Infinity;
        for (let i = 0; i < pts.length; i++) {
          const v = pts[i].v;
          if (v < min) min = v;
          if (v > max) max = v;
        }
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
    const truncated = stride > 1;
    /** @type {{ startRaw: string, endRaw: string, startMs: number | null, endMs: number | null, timeColumnLabel: string }} */
    let timeRange = {
      startRaw: "",
      endRaw: "",
      startMs: null,
      endMs: null,
      timeColumnLabel: headers[0] || "Time",
    };
    if (firstDataLine != null && lastDataLine != null) {
      const sc = splitCsvLine(firstDataLine);
      const ec = splitCsvLine(lastDataLine);
      const startRaw = (sc[0] || "").replace(/^"|"$/g, "").trim();
      const endRaw = (ec[0] || "").replace(/^"|"$/g, "").trim();
      timeRange = {
        startRaw,
        endRaw,
        startMs: parseSensorTimestampMs(sc[0] || ""),
        endMs: parseSensorTimestampMs(ec[0] || ""),
        timeColumnLabel: headers[0] || "Time",
      };
    }
    return {
      headers,
      rows,
      rowCount,
      numericCols,
      timeRange,
      ...(truncated ? { truncated: true, originalDataRows: dataLineCount, rowStride: stride } : {}),
    };
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
   * @param {{ x: number, y: number }[]} pts
   * @param {number} maxN
   */
  function subsampleChartPts(pts, maxN) {
    if (pts.length <= maxN) return pts;
    const stride = Math.ceil(pts.length / maxN);
    /** @type {{ x: number, y: number }[]} */
    const out = [];
    for (let i = 0; i < pts.length; i += stride) out.push(pts[i]);
    const last = pts[pts.length - 1];
    const tail = out[out.length - 1];
    if (!tail || tail.x !== last.x || tail.y !== last.y) out.push(last);
    return out;
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
    /* Plot is always the dark "black + green" canvas look; the panel chrome follows html[data-theme] in CSS. */
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
      const strokePts = subsampleChartPts(s.pts, GPU_SENSOR_CHART_MAX_POINTS);
      for (const p of strokePts) {
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

  /** Debug-only: collects unknown MSInfo labels so new languages can be added systematically. */
  function isDebugI18nMode() {
    try {
      const sp = new URLSearchParams(location.search || "");
      return sp.get("debug") === "1" || sp.get("i18n") === "1";
    } catch {
      return false;
    }
  }

  /**
   * @returns {{
   *   version: number,
   *   createdAtIso: string,
   *   fileName: string,
   *   encodingLabel: string,
   *   unknownLabelsByPath: Record<string, { total: number, labels: Record<string, number> }>,
   *   notes: string[]
   * }}
   */
  function createI18nDiagnosticsSnapshot(fileName, encodingLabel, kvs, systemSummary) {
    /** @type {Record<string, { total: number, labels: Record<string, number> }>} */
    const unknownLabelsByPath = {};
    const add = (path, label) => {
      const p = String(path || "").trim() || "(root)";
      const l = String(label || "").replace(/\s+/g, " ").trim();
      if (!l) return;
      if (!unknownLabelsByPath[p]) unknownLabelsByPath[p] = { total: 0, labels: {} };
      unknownLabelsByPath[p].total++;
      unknownLabelsByPath[p].labels[l] = (unknownLabelsByPath[p].labels[l] || 0) + 1;
    };

    /** @type {Record<string, number>} */
    const unknownTokens = {};
    const addTok = (s) => {
      const t = String(s || "").replace(/\s+/g, " ").trim();
      if (!t) return;
      unknownTokens[t] = (unknownTokens[t] || 0) + 1;
    };

    /** Normalize a token the same way as offline mapping does (for membership checks). */
    const normKey = (s) => {
      let t = normalizeMsinfoLineBreakEntities(String(s ?? "")).trim();
      try {
        t = t.normalize("NFC");
      } catch {
        /* */
      }
      return t;
    };

    const knownEnglishish = (s) => {
      const t = normKey(s);
      if (!t) return true;
      // If the token exists in our offline phrase table (even if it maps to itself), treat as supported.
      if (MSINFO_I18N_EN_TOKEN_KEYS.has(t)) return true;
      // If it does not look non-English, treat as known (no need to collect).
      if (!localeScriptLooksNonEnglishListed(t)) return true;
      // If our offline translation changes it, it is already covered.
      const en = translateMsinfoI18nTokensToEnglish(t);
      return en !== t;
    };

    for (const k of Array.isArray(kvs) ? kvs : []) {
      const item = String(k?.item || "").trim();
      if (!item) continue;
      if (knownEnglishish(item)) continue;
      add(k?.path || "", item);
    }

    // Also capture unknown tokens from structured sections (keys/values) so non-MSInfo tabs are covered.
    const sum = systemSummary && typeof systemSummary === "object" ? systemSummary : null;
    if (sum) {
      const net = Array.isArray(sum.networkAdapters) ? sum.networkAdapters : [];
      for (const a of net) {
        const details = Array.isArray(a?.details) ? a.details : [];
        for (const d of details) {
          const k = String(d?.k || "").trim();
          const v = String(d?.v || "").trim();
          if (k && !knownEnglishish(k)) addTok(k);
          if (v && !knownEnglishish(v)) addTok(v);
        }
      }
      const svcAll = Array.isArray(sum.servicesAll) ? sum.servicesAll : [];
      const svcRun = Array.isArray(sum.runningServices) ? sum.runningServices : [];
      for (const s of [...svcAll, ...svcRun]) {
        const name = String(s?.name || "").trim();
        const state = String(s?.state || "").trim();
        const startMode = String(s?.startMode || "").trim();
        if (name && !knownEnglishish(name)) addTok(name);
        if (state && !knownEnglishish(state)) addTok(state);
        if (startMode && !knownEnglishish(startMode)) addTok(startMode);
      }
      const drives = Array.isArray(sum.storageDrives) ? sum.storageDrives : [];
      for (const d of drives) {
        const fs = String(d?.fileSystem || "").trim();
        const vol = String(d?.volumeName || "").trim();
        if (fs && !knownEnglishish(fs)) addTok(fs);
        if (vol && !knownEnglishish(vol)) addTok(vol);
      }
    }

    // Detect likely source language from MSInfo paths/items + unknown strings (unknown labels alone are often ASCII).
    const detectBlobParts = [];
    for (const block of Object.values(unknownLabelsByPath)) {
      for (const k of Object.keys(block?.labels || {})) detectBlobParts.push(k);
    }
    for (const k of Object.keys(unknownTokens)) detectBlobParts.push(k);
    const pathBlob = (Array.isArray(kvs) ? kvs : [])
      .map((kv) => String(kv?.path || "").trim())
      .filter(Boolean)
      .join(" | ");
    const itemSample = (Array.isArray(kvs) ? kvs : [])
      .slice(0, 400)
      .map((kv) => String(kv?.item || "").trim())
      .filter(Boolean)
      .join(" | ");
    const lang = detectOfflineUiLanguage(
      [pathBlob, itemSample, detectBlobParts.join("  "), String(fileName || "")].join("\n")
    );

    const notes = [
      "This report lists only strings that look non-English AND are not already covered by the current offline translation tables.",
      "Use it to add new token pairs or label mappings without guessing. Keep translations specific (prefer full labels over short substrings).",
      "The unknownTokens block additionally lists non-English tokens found in Network / Services / Storage values that were not translated by current offline tables.",
      "After a viewer update that adds your missing pairs, export once more: the list should be empty (or only show text that is genuinely new). Re-exporting the same .nfo many times is not required unless the file or the app changed.",
    ];

    return {
      version: 1,
      createdAtIso: new Date().toISOString(),
      fileName: String(fileName || ""),
      encodingLabel: String(encodingLabel || ""),
      detectedLanguageCode: lang.code,
      detectedLanguageName: lang.name,
      detectedLanguageConfidence: lang.confidence,
      unknownLabelsByPath,
      unknownTokens,
      notes,
    };
  }

  /**
   * User-facing export: includes path context + frequency, plain text.
   * @param {ReturnType<typeof createI18nDiagnosticsSnapshot> | null} diag
   * @returns {string}
   */
  function buildLanguageAdderTxt(diag) {
    if (!diag) return "";
    const lines = [];
    lines.push("Language Adder export (offline)");
    lines.push(`createdAt: ${diag.createdAtIso}`);
    lines.push(`file: ${diag.fileName || ""}`);
    lines.push(`encoding: ${diag.encodingLabel || ""}`);
    if (diag.detectedLanguageName) {
      const code = diag.detectedLanguageCode || "";
      const conf = Number(diag.detectedLanguageConfidence || 0);
      lines.push(`detectedLanguage: ${diag.detectedLanguageName}${code ? ` (${code})` : ""} (confidence: ${conf.toFixed(2)})`);
    }
    lines.push("");
    for (const n of diag.notes || []) lines.push(`- ${n}`);
    lines.push("");

    // Unknown labels grouped by MSInfo path.
    const paths = Object.keys(diag.unknownLabelsByPath || {}).sort((a, b) => a.localeCompare(b));
    lines.push("=== Unknown MSInfo Item labels (grouped by path) ===");
    if (!paths.length) {
      lines.push("(none)");
    } else {
      for (const p of paths) {
        const block = diag.unknownLabelsByPath[p];
        const labels = block && block.labels ? block.labels : {};
        const list = Object.entries(labels).sort((a, b) => (b[1] || 0) - (a[1] || 0) || a[0].localeCompare(b[0]));
        lines.push("");
        lines.push(`[${p}]  (total occurrences: ${block?.total || 0})`);
        for (const [k, n] of list) {
          lines.push(`${n}x\t${k}`);
        }
      }
    }

    lines.push("");
    lines.push("=== Unknown tokens from parsed sections (Network / Services / Storage) ===");
    const toks = Object.entries(diag.unknownTokens || {}).sort(
      (a, b) => (b[1] || 0) - (a[1] || 0) || a[0].localeCompare(b[0])
    );
    if (!toks.length) lines.push("(none)");
    else for (const [k, n] of toks) lines.push(`${n}x\t${k}`);

    lines.push("");
    lines.push("How to use:");
    lines.push("- Send this .txt file back to the developer/maintainer.");
    lines.push("- We will add English mappings for the repeated labels/tokens first.");
    lines.push("- Avoid translating section headings; focus on field labels and common values (Yes/No, units, statuses).");
    lines.push("");
    return lines.join("\n");
  }

  /**
   * @param {ReturnType<typeof createI18nDiagnosticsSnapshot> | null} diag
   * @returns {string}
   */
  function buildI18nStubFromDiagnostics(diag) {
    if (!diag) return "";
    /** @type {{ s: string, n: number }[]} */
    const items = [];
    const push = (s, n) => {
      const t = String(s || "").replace(/\s+/g, " ").trim();
      if (!t) return;
      items.push({ s: t, n: Math.max(1, Number(n) || 1) });
    };
    for (const [path, block] of Object.entries(diag.unknownLabelsByPath || {})) {
      void path;
      const labels = block && block.labels ? block.labels : {};
      for (const [k, v] of Object.entries(labels)) push(k, v);
    }
    for (const [k, v] of Object.entries(diag.unknownTokens || {})) push(k, v);

    // Deduplicate by string; keep max count.
    const by = new Map();
    for (const it of items) {
      const prev = by.get(it.s);
      if (!prev || it.n > prev.n) by.set(it.s, it);
    }
    const list = Array.from(by.values()).sort((a, b) => b.n - a.n || a.s.localeCompare(b.s));

    const escJs = (s) => String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const lines = [];
    lines.push("// Paste candidates into LOCALE_PAIRS_MSINFO_INTL (or a new LOCALE_PAIRS_MSINFO_<lang>)");
    lines.push("// Fill in the English right-hand side. Keep keys specific; avoid short substrings.");
    lines.push("");
    for (const it of list) {
      lines.push(`// seen ${it.n}×`);
      lines.push(`["${escJs(it.s)}", ""],`);
    }
    lines.push("");
    return lines.join("\n");
  }

  /**
   * Shared Language Adder snapshot builder for non-System tabs.
   * Collects tokens that look non-English and are not already supported by offline mappings.
   *
   * @param {{
   *   fileName: string,
   *   encodingLabel: string,
   *   source: "bsod" | "gpu" | "evtx" | "dxdiag",
   *   tokens: string[],
   * }} o
   * @returns {{
   *   version: number,
   *   createdAtIso: string,
   *   fileName: string,
   *   encodingLabel: string,
   *   source: string,
   *   detectedLanguageCode: string,
   *   detectedLanguageName: string,
   *   detectedLanguageConfidence: number,
   *   unknownTokens: Record<string, number>,
   *   notes: string[]
   * }}
   */
  function createLanguageAdderSnapshot(o) {
    const unknownTokens = {};
    const addTok = (s) => {
      const t = String(s || "").replace(/\s+/g, " ").trim();
      if (!t) return;
      unknownTokens[t] = (unknownTokens[t] || 0) + 1;
    };

    const normKey = (s) => {
      let t = normalizeMsinfoLineBreakEntities(String(s ?? "")).trim();
      try {
        t = t.normalize("NFC");
      } catch {
        /* */
      }
      return t;
    };

    const isSupportedOrEnglishish = (s) => {
      const t = normKey(s);
      if (!t) return true;
      if (MSINFO_I18N_EN_TOKEN_KEYS.has(t)) return true;
      if (!localeScriptLooksNonEnglishListed(t)) return true;
      const en = translateMsinfoI18nTokensToEnglish(t);
      return en !== t;
    };

    for (const t of Array.isArray(o?.tokens) ? o.tokens : []) {
      if (!t) continue;
      if (isSupportedOrEnglishish(t)) continue;
      addTok(t);
    }

    const lang = detectOfflineUiLanguage(
      [
        Object.keys(unknownTokens).join("  "),
        Array.isArray(o?.tokens) ? o.tokens.slice(0, 800).join("  ") : "",
        String(o?.fileName || ""),
      ].join("\n")
    );
    const notes = [
      "This report lists only strings that look non-English AND are not already covered by the current offline translation tables.",
      "Use it to add new token pairs or label mappings without guessing. Keep translations specific (prefer full labels over short substrings).",
      "After the viewer adds mappings from your export, one follow-up export from the same source should show (none) unless strings are new.",
    ];

    return {
      version: 1,
      createdAtIso: new Date().toISOString(),
      fileName: String(o?.fileName || ""),
      encodingLabel: String(o?.encodingLabel || ""),
      source: String(o?.source || ""),
      detectedLanguageCode: lang.code,
      detectedLanguageName: lang.name,
      detectedLanguageConfidence: lang.confidence,
      unknownTokens,
      notes,
    };
  }

  /**
   * @param {ReturnType<typeof createLanguageAdderSnapshot> | null} diag
   * @returns {string}
   */
  function buildLanguageAdderTxtFromSnapshot(diag) {
    if (!diag) return "";
    const lines = [];
    lines.push("Language Adder export (offline)");
    lines.push(`createdAt: ${diag.createdAtIso}`);
    lines.push(`file: ${diag.fileName || ""}`);
    lines.push(`encoding: ${diag.encodingLabel || ""}`);
    lines.push(`source: ${diag.source || ""}`);
    if (diag.detectedLanguageName) {
      const code = diag.detectedLanguageCode || "";
      const conf = Number(diag.detectedLanguageConfidence || 0);
      lines.push(`detectedLanguage: ${diag.detectedLanguageName}${code ? ` (${code})` : ""} (confidence: ${conf.toFixed(2)})`);
    }
    lines.push("");
    for (const n of diag.notes || []) lines.push(`- ${n}`);
    lines.push("");
    lines.push("=== Unknown tokens (this tab) ===");
    const toks = Object.entries(diag.unknownTokens || {}).sort(
      (a, b) => (b[1] || 0) - (a[1] || 0) || a[0].localeCompare(b[0])
    );
    if (!toks.length) lines.push("(none)");
    else for (const [k, n] of toks) lines.push(`${n}x\t${k}`);
    lines.push("");
    return lines.join("\n");
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
    const loadJobEl = panel.querySelector(".panel-load-job--system");
    const loadProgress = panel.querySelector(".system-panel-load__progress");
    const loadLabel = panel.querySelector(".system-panel-load__label");
    const loadStatusRow = panel.querySelector(".system-panel-load__status");
    const loadPercentEl = panel.querySelector(".system-panel-load__percent");
    const loadCheck = panel.querySelector("[data-system-load-check]");
    const pendingAnalyzeEl = panel.querySelector("[data-system-pending-analyze]");
    const pendingFnameEl = panel.querySelector("[data-pending-fname]");
    const btnAnalyze = panel.querySelector("[data-system-analyze]");
    const systemCompare = document.getElementById("advanced-system-compare");
    const compareDrop1 = systemCompare?.querySelector(".dropzone--compare-1");
    const compareDrop2 = systemCompare?.querySelector(".dropzone--compare-2");
    const comparePicked1 = systemCompare?.querySelector("[data-compare-picked='1']");
    const comparePicked2 = systemCompare?.querySelector("[data-compare-picked='2']");
    const compareInput1 = systemCompare?.querySelector(".file-input--compare-1");
    const compareInput2 = systemCompare?.querySelector(".file-input--compare-2");
    const compareRun = systemCompare?.querySelector(".system-compare-run");
    const compareStatus = systemCompare?.querySelector(".system-compare__status");
    const compareStructured = systemCompare?.querySelector(".system-compare__structured");
    const compareRawDetails = systemCompare?.querySelector(".system-compare__raw-details");
    const compareOut = systemCompare?.querySelector(".system-compare__pre");
    const SYSTEM_COMPARE_MAX_CHARS = 200000;
    const debugI18n = isDebugI18nMode();
    /** @type {ReturnType<typeof createI18nDiagnosticsSnapshot> | null} */
    let lastI18nDiag = null;

    // User-facing Language Adder button (always available; exports unknown tokens when a file is analyzed).
    let btnLangAdder = null;
    if (toolbarWrap) {
      const toolbar = toolbarWrap.querySelector(".system-toolbar");
      if (toolbar) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "btn btn--ghost btn-lang-adder";
        b.textContent = "Language Adder";
        b.title = "Export unknown (untranslated) labels/tokens for adding a new language offline";
        b.disabled = true;
        b.addEventListener("click", () => {
          if (!lastI18nDiag || !state) {
            window.alert("Load and analyze a System Information file first.");
            return;
          }
          const safeBase = (state.name || "msinfo")
            .replace(/\.[^.]+$/, "")
            .replace(/[^A-Za-z0-9._-]+/g, "_")
            .slice(0, 80);
          const prefix = languageAdderExportBasename(lastI18nDiag, safeBase);
          const fn = `${prefix}.language-adder.txt`;
          downloadTextAsFile(fn, buildLanguageAdderTxt(lastI18nDiag), "text/plain;charset=utf-8");
        });
        toolbar.appendChild(b);
        btnLangAdder = b;
      }
    }

    /** Debug-only export button (injected into toolbar). */
    let btnI18nExport = null;
    let btnI18nStub = null;
    if (debugI18n && toolbarWrap) {
      const toolbar = toolbarWrap.querySelector(".system-toolbar");
      if (toolbar) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "btn btn--ghost";
        b.textContent = "Export i18n diagnostics";
        b.title = "Debug: download unknown MSInfo labels as JSON";
        b.disabled = true;
        b.addEventListener("click", () => {
          if (!lastI18nDiag || !state) {
            window.alert("No diagnostics yet. Load and analyze an MSInfo file first.");
            return;
          }
          const safeBase = (state.name || "msinfo")
            .replace(/\.[^.]+$/, "")
            .replace(/[^A-Za-z0-9._-]+/g, "_")
            .slice(0, 80);
          const fn = `${safeBase}.i18n-missing.json`;
          downloadTextAsFile(fn, JSON.stringify(lastI18nDiag, null, 2), "application/json;charset=utf-8");
        });
        toolbar.appendChild(b);
        btnI18nExport = b;

        const s = document.createElement("button");
        s.type = "button";
        s.className = "btn btn--ghost";
        s.textContent = "Export i18n stub";
        s.title = "Debug: download a translation stub (fill English values, then paste into token tables)";
        s.disabled = true;
        s.addEventListener("click", () => {
          if (!lastI18nDiag || !state) {
            window.alert("No diagnostics yet. Load and analyze an MSInfo file first.");
            return;
          }
          const safeBase = (state.name || "msinfo")
            .replace(/\.[^.]+$/, "")
            .replace(/[^A-Za-z0-9._-]+/g, "_")
            .slice(0, 80);
          const fn = `${safeBase}.i18n-stub.txt`;
          downloadTextAsFile(fn, buildI18nStubFromDiagnostics(lastI18nDiag), "text/plain;charset=utf-8");
        });
        toolbar.appendChild(s);
        btnI18nStub = s;
      }
    }
    /** @type {AbortController | null} */
    let systemLoadAbort = null;
    /** @type {{ name: string, buffer: ArrayBuffer, label: string, fileMetaBase: string, msiRepairedXml: string | null, msiOriginalDecoded: string, msiFixedRaw: string | null, msiViewOriginal: boolean, analyzed?: boolean } | null} */
    let state = null;
    /** @type {ReturnType<typeof setTimeout> | null} */
    let searchDebounce = null;

    function isSystemAdvanced() {
      return document.documentElement.getAttribute("data-advanced") === "on";
    }

    function syncPendingAnalyzeUi() {
      if (!pendingAnalyzeEl || !btnAnalyze) return;
      const show = !!state && state.analyzed === false && !isSystemAdvanced();
      pendingAnalyzeEl.hidden = !show;
      btnAnalyze.disabled = !show;
      if (pendingFnameEl && state) pendingFnameEl.textContent = state.name;
    }

    function setVisible(loaded) {
      if (toolbarWrap) toolbarWrap.hidden = !loaded;
      if (systemBody) systemBody.hidden = !loaded;
      dropzone.style.display = loaded ? "none" : "";
      if (!loaded) clearCompareUi();
    }

    function clearCompareUi() {
      if (compareStatus) compareStatus.textContent = "";
      if (compareOut) compareOut.textContent = "";
      if (compareInput1 instanceof HTMLInputElement) compareInput1.value = "";
      if (compareInput2 instanceof HTMLInputElement) compareInput2.value = "";
      if (compareRawDetails) compareRawDetails.open = false;
      if (compareStructured) {
        compareStructured.innerHTML = "";
        compareStructured.hidden = true;
      }
      if (comparePicked1) {
        comparePicked1.textContent = "";
        comparePicked1.hidden = true;
      }
      if (comparePicked2) {
        comparePicked2.textContent = "";
        comparePicked2.hidden = true;
      }
      if (compareDrop1) compareDrop1.classList.remove("is-dragover");
      if (compareDrop2) compareDrop2.classList.remove("is-dragover");
    }

    function syncComparePickedLabelsAndStatus() {
      const f1 = compareInput1 && compareInput1.files && compareInput1.files[0] ? compareInput1.files[0] : null;
      const f2 = compareInput2 && compareInput2.files && compareInput2.files[0] ? compareInput2.files[0] : null;
      if (comparePicked1) {
        if (f1) {
          comparePicked1.textContent = f1.name;
          comparePicked1.hidden = false;
        } else {
          comparePicked1.textContent = "";
          comparePicked1.hidden = true;
        }
      }
      if (comparePicked2) {
        if (f2) {
          comparePicked2.textContent = f2.name;
          comparePicked2.hidden = false;
        } else {
          comparePicked2.textContent = "";
          comparePicked2.hidden = true;
        }
      }
      if (compareStatus) {
        if (f1 && f2) {
          compareStatus.textContent = "Click “Run comparison” when you’re ready.";
        } else if (f1) {
          compareStatus.textContent = "Add file 2, then run comparison.";
        } else if (f2) {
          compareStatus.textContent = "Add file 1, then run comparison.";
        } else {
          compareStatus.textContent = "";
        }
      }
    }

    /**
     * Display text aligned with the summary parser (repaired raw when present).
     * @param {ArrayBuffer} buffer
     * @param {string} enc
     */
    function displayTextForSystemCompare(buffer, enc) {
      const { text } = decodeBuffer(buffer, "system", enc);
      const recovery = parseMsInfoDocumentWithRecovery(text);
      return recovery.rawDisplayText != null ? recovery.rawDisplayText : text;
    }

    /** @param {string[]} la @param {string[]} lb */
    function lineDiffLines(la, lb) {
      const max = Math.max(la.length, lb.length);
      const out = [];
      for (let i = 0; i < max; i++) {
        const A = la[i];
        const B = lb[i];
        if (A === B) out.push(`  ${A ?? ""}`);
        else {
          if (A !== undefined) out.push(`- ${A}`);
          if (B !== undefined) out.push(`+ ${B}`);
        }
      }
      return out.join("\n");
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

    /**
     * @param {{ signal?: AbortSignal, onStage?: (frac: number, msg: string) => void } | undefined} opts
     */
    async function applyDecode(opts) {
      if (!state || !pre || !summaryEl) return;
      const signal = opts?.signal;
      const onStage = opts?.onStage;
      const enc = encodingSelect.value;
      if (onStage) {
        await yieldToMain();
        signal?.throwIfAborted();
        onStage(0.08, "Decoding file…");
      }
      const { text, label } = decodeBuffer(state.buffer, "system", enc);
      state.label = label;
      state.msiOriginalDecoded = text;
      if (onStage) {
        signal?.throwIfAborted();
        onStage(0.38, "Parsing MSInfo…");
        await yieldToMain();
      }
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
      if (onStage) {
        signal?.throwIfAborted();
        onStage(0.72, "Building summary…");
        await yieldToMain();
      }
      if (recovery.doc) {
        try {
          data = walkMsInfo(recovery.doc);
        } catch (err) {
          console.warn("walkMsInfo failed:", err);
          data = null;
        }
      }
      if (
        !data &&
        recovery.data &&
        ((recovery.data.kvs && recovery.data.kvs.length > 0) ||
          (recovery.data.rows && recovery.data.rows.length > 0))
      ) {
        data = recovery.data;
      }

      const xmlRep =
        recovery.doc && Array.isArray(/** @type {any} */ (recovery.doc)._msinfoRepairs)
          ? /** @type {any} */ (recovery.doc)._msinfoRepairs
          : [];
      if (data) {
        const sum = extractSystemSummary(data);
        renderSystemSummary(summaryEl, sum, true, recovery.notes, xmlRep);
        if (debugI18n && Array.isArray(data.kvs)) {
          try {
            lastI18nDiag = createI18nDiagnosticsSnapshot(state.name, state.label, data.kvs, sum);
            if (btnI18nExport) btnI18nExport.disabled = false;
            if (btnI18nStub) btnI18nStub.disabled = false;
          } catch {
            lastI18nDiag = null;
          }
        }
          // Always refresh Language Adder snapshot after any successful parse.
          if (Array.isArray(data.kvs)) {
            try {
              lastI18nDiag = createI18nDiagnosticsSnapshot(state.name, state.label, data.kvs, sum);
              if (btnLangAdder) btnLangAdder.disabled = false;
            } catch {
              /* keep prior snapshot */
            }
          }
      } else {
        renderSystemSummary(summaryEl, null, false, recovery.notes, xmlRep, {
          kind: recovery.nonMsinfoKind || "unknown",
          summary: recovery.nonMsinfoSummary || "Unrecognised content",
          suggestedTab: recovery.nonMsinfoSuggestedTab || null,
        });
      }
      if (searchInput && searchInput.value.trim()) performRawSearch(searchInput.value);
      if (onStage) onStage(1, "done");
      if (state) state.analyzed = true;
      syncPendingAnalyzeUi();
    }

    /** @param {string} [lineLabel] */
    function setSystemPanelLoadProgress(frac, lineLabel) {
      const f = Math.max(0, Math.min(1, frac));
      const p = Math.round(f * 100);
      const line = lineLabel != null && lineLabel !== "" ? lineLabel : "Comparing";
      if (loadProgress) {
        loadProgress.value = p;
        loadProgress.max = 100;
      }
      if (loadPercentEl) {
        loadPercentEl.textContent = `${p}%`;
        loadPercentEl.hidden = false;
        loadPercentEl.setAttribute("aria-label", `${line}, ${p} percent complete`);
      }
      if (loadLabel) loadLabel.textContent = line;
    }

    /** @param {string} [initialLine] */
    function startSystemPanelLoadJob(initialLine) {
      if (!loadJobEl) return;
      loadJobEl.hidden = false;
      loadJobEl.classList.remove("panel-load-job--phase-read");
      if (loadStatusRow) loadStatusRow.classList.remove("panel-load-job__status--done");
      setSystemPanelLoadProgress(0, initialLine);
    }

    async function finishSystemPanelLoadJobAsync() {
      if (loadProgress) loadProgress.value = 100;
      if (loadPercentEl) {
        loadPercentEl.textContent = "100%";
        loadPercentEl.hidden = false;
        const doneLine = loadLabel?.textContent && loadLabel.textContent.startsWith("Analyzing") ? "Analyzing" : "Comparing";
        loadPercentEl.setAttribute("aria-label", `${doneLine}, 100 percent, completed`);
      }
      if (loadStatusRow) loadStatusRow.classList.add("panel-load-job__status--done");
      if (loadLabel) loadLabel.textContent = "Completed";
      await new Promise((r) => setTimeout(r, 520));
      if (loadJobEl) loadJobEl.hidden = true;
      if (loadPercentEl) {
        loadPercentEl.textContent = "";
        loadPercentEl.hidden = true;
        loadPercentEl.removeAttribute("aria-label");
      }
      if (loadStatusRow) loadStatusRow.classList.remove("panel-load-job__status--done");
      if (loadLabel) loadLabel.textContent = "Comparing";
    }

    function resetSystemPanelLoadJobOnError() {
      if (loadJobEl) loadJobEl.hidden = true;
      if (loadProgress) loadProgress.value = 0;
      if (loadPercentEl) {
        loadPercentEl.textContent = "";
        loadPercentEl.hidden = true;
        loadPercentEl.removeAttribute("aria-label");
      }
      if (loadStatusRow) loadStatusRow.classList.remove("panel-load-job__status--done");
      if (loadLabel) loadLabel.textContent = "Comparing";
    }

    async function runSystemAnalyze() {
      if (!state || state.analyzed) return;
      systemLoadAbort?.abort();
      systemLoadAbort = new AbortController();
      const signal = systemLoadAbort.signal;
      if (pendingAnalyzeEl) pendingAnalyzeEl.hidden = true;
      if (btnAnalyze) btnAnalyze.disabled = true;
      startSystemPanelLoadJob("Analyzing · Preparing…");
      try {
        await applyDecode({
          signal,
          onStage(frac, msg) {
            if (msg === "done") return;
            setSystemPanelLoadProgress(frac, `Analyzing · ${msg}`);
          },
        });
        await finishSystemPanelLoadJobAsync();
      } catch (e) {
        if (e && (/** @type {Error} */ (e).name === "AbortError" || /** @type {any} */ (e).code === 20)) {
          /* cleared or new load */
        } else {
          console.error(e);
          if (meta) meta.textContent = "Could not parse this file.";
        }
        resetSystemPanelLoadJobOnError();
        if (state && !state.analyzed) {
          if (pendingAnalyzeEl) pendingAnalyzeEl.hidden = false;
          if (btnAnalyze) btnAnalyze.disabled = false;
        }
        syncPendingAnalyzeUi();
      }
    }

    async function loadFile(file) {
      systemLoadAbort?.abort();
      systemLoadAbort = new AbortController();
      const signal = systemLoadAbort.signal;
      const hideSystemLoadJob = () => {
        if (loadJobEl) {
          loadJobEl.hidden = true;
          loadJobEl.classList.remove("panel-load-job--phase-read");
        }
        if (loadPercentEl) {
          loadPercentEl.textContent = "";
          loadPercentEl.hidden = true;
          loadPercentEl.removeAttribute("aria-label");
        }
        if (loadStatusRow) loadStatusRow.classList.remove("panel-load-job__status--done");
        if (loadLabel) loadLabel.textContent = "Comparing";
      };
      try {
        hideSystemLoadJob();
        clearCompareUi();
        const buffer = await file.arrayBuffer();
        signal.throwIfAborted();
        const deferDecode = !isSystemAdvanced();
        state = {
          name: file.name,
          buffer,
          label: "",
          fileMetaBase: "",
          msiRepairedXml: null,
          msiOriginalDecoded: "",
          msiFixedRaw: null,
          msiViewOriginal: false,
          analyzed: false,
        };
        encodingSelect.value = "auto";
        setVisible(true);
        if (deferDecode) {
          if (pre) pre.textContent = "";
          if (summaryEl) summaryEl.innerHTML = "";
          if (btnCopyRepaired) btnCopyRepaired.hidden = true;
          if (btnMsiRawToggle) btnMsiRawToggle.hidden = true;
          if (meta) {
            const kb = (buffer.byteLength / 1024).toFixed(1);
            meta.textContent = `${file.name} · ${kb} KiB — click Analyze to parse.`;
          }
          syncPendingAnalyzeUi();
        } else {
          await applyDecode({ signal });
        }
        signal.throwIfAborted();
        if (compareInput1 instanceof HTMLInputElement) {
          const dt = new DataTransfer();
          try {
            dt.items.add(file);
            compareInput1.files = dt.files;
          } catch {
            /* */
          }
        }
        syncComparePickedLabelsAndStatus();
      } catch (e) {
        if (e && (/** @type {Error} */ (e).name === "AbortError" || /** @type {any} */ (e).code === 20)) {
          state = null;
          if (pre) pre.textContent = "";
          if (summaryEl) summaryEl.innerHTML = "";
          if (btnCopyRepaired) btnCopyRepaired.hidden = true;
          if (btnMsiRawToggle) btnMsiRawToggle.hidden = true;
          if (meta) meta.textContent = "Cancelled.";
          if (searchInput) searchInput.value = "";
          performRawSearch("");
          if (searchResults) searchResults.hidden = true;
          setVisible(false);
          syncPendingAnalyzeUi();
        } else {
          console.error(e);
          if (meta) meta.textContent = "Could not load this file.";
        }
      } finally {
        hideSystemLoadJob();
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
      if (!dt || !dt.files.length) return;
      void loadFile(dt.files[0]);
    });
    input.addEventListener("change", () => {
      const f = input.files && input.files[0];
      if (f) void loadFile(f);
      input.value = "";
    });
    dropzone.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        input.click();
      }
    });
    encodingSelect.addEventListener("change", () => {
      if (!isSystemAdvanced() && state && !state.analyzed) return;
      void applyDecode(undefined);
    });
    panel.addEventListener(
      "click",
      (e) => {
        const t = e.target;
        if (!(t instanceof Element)) return;
        const btn = t.closest(".report-category__translate");
        if (!btn) return;
        if (!summaryEl?.contains(btn) && !compareStructured?.contains(btn)) return;
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
          if (showEn) {
            const tEn = translateExportValueToEnglish(raw);
            if (tEn !== raw) {
              span.textContent = tEn;
            } else {
              const alt = span.getAttribute("data-alt-en") || "";
              span.textContent = alt || tEn;
            }
          } else {
            span.textContent = raw;
          }
        });
      },
      true
    );
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
      systemLoadAbort?.abort();
      if (loadJobEl) loadJobEl.hidden = true;
      state = null;
      if (pre) pre.textContent = "";
      if (summaryEl) summaryEl.innerHTML = "";
      if (btnCopyRepaired) btnCopyRepaired.hidden = true;
      if (btnMsiRawToggle) btnMsiRawToggle.hidden = true;
      meta.textContent = "";
      if (searchInput) searchInput.value = "";
      performRawSearch("");
      if (searchResults) searchResults.hidden = true;
      clearCompareUi();
      setVisible(false);
      syncPendingAnalyzeUi();
    });
    btnAnalyze?.addEventListener("click", () => void runSystemAnalyze());
    const dataAdvancedObs = new MutationObserver(() => {
      if (isSystemAdvanced() && state && !state.analyzed) void runSystemAnalyze();
    });
    dataAdvancedObs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-advanced"] });
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

    /**
     * @param {HTMLElement | null | undefined} drop
     * @param {HTMLInputElement | null | undefined} fileInput
     */
    function wireCompareDropzone(drop, fileInput) {
      if (!drop || !(fileInput instanceof HTMLInputElement)) return;
      const preventCompareDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
      };
      ["dragenter", "dragover", "dragleave", "drop"].forEach((ev) => {
        drop.addEventListener(ev, preventCompareDrop);
      });
      drop.addEventListener("dragenter", () => drop.classList.add("is-dragover"));
      drop.addEventListener("dragleave", () => drop.classList.remove("is-dragover"));
      drop.addEventListener("dragover", () => drop.classList.add("is-dragover"));
      drop.addEventListener("drop", (e) => {
        drop.classList.remove("is-dragover");
        const dt = e.dataTransfer;
        if (!dt || !dt.files.length) return;
        const f = dt.files[0];
        const transfer = new DataTransfer();
        transfer.items.add(f);
        fileInput.files = transfer.files;
        syncComparePickedLabelsAndStatus();
      });
      drop.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          fileInput.click();
        }
      });
      fileInput.addEventListener("change", () => {
        syncComparePickedLabelsAndStatus();
      });
    }
    wireCompareDropzone(compareDrop1, compareInput1);
    wireCompareDropzone(compareDrop2, compareInput2);

    /** Show the System Advanced block so compare output is not hidden. Matches Settings ▸ Advanced. */
    function showAdvancedForCompare() {
      const advInline = document.getElementById("advanced-inline");
      if (advInline && advInline.hidden) {
        document.documentElement.setAttribute("data-advanced", "on");
        try {
          localStorage.setItem("log-viewer-advanced", "1");
        } catch {
          /* */
        }
        advInline.hidden = false;
        const godsTab = document.getElementById("tab-gods-eye");
        if (godsTab instanceof HTMLElement) {
          godsTab.removeAttribute("hidden");
          godsTab.setAttribute("aria-hidden", "false");
        }
        const t = document.getElementById("advanced-toggle");
        if (t) {
          t.setAttribute("aria-expanded", "true");
          t.textContent = "Advanced · on";
        }
        queueMicrotask(() => {
          try {
            window.dispatchEvent(new Event("rv-workspace-sync"));
          } catch {
            /* */
          }
        });
      }
    }

    compareRun?.addEventListener("click", async () => {
      const f1 = compareInput1 instanceof HTMLInputElement && compareInput1.files?.[0] ? compareInput1.files[0] : null;
      const f2 = compareInput2 instanceof HTMLInputElement && compareInput2.files?.[0] ? compareInput2.files[0] : null;
      if (!f1 || !f2) {
        if (compareStatus) {
          compareStatus.textContent = f1
            ? "Add file 2 in the right-hand box, then run comparison."
            : f2
              ? "Add file 1 in the left-hand box, then run comparison."
              : "Add both .nfo / .xml files (file 1 and file 2), then run comparison.";
        }
        if (!f1 && compareDrop1) {
          try {
            compareDrop1.focus();
          } catch {
            /* */
          }
        } else if (f1 && !f2 && compareDrop2) {
          try {
            compareDrop2.focus();
          } catch {
            /* */
          }
        }
        return;
      }
      showAdvancedForCompare();
      if (compareStatus) compareStatus.textContent = "";
      if (compareRun instanceof HTMLButtonElement) compareRun.disabled = true;
      startSystemPanelLoadJob("Comparing");
      const compareReadAbort = new AbortController();
      try {
        const enc = encodingSelect instanceof HTMLSelectElement ? encodingSelect.value : "auto";
        setSystemPanelLoadProgress(0.02, "Comparing");
        await yieldToMain();
        const bufA = await readFileAsArrayBufferWithProgress(f1, compareReadAbort.signal, (frac) => {
          setSystemPanelLoadProgress(0.02 + 0.14 * frac, "Comparing");
        });
        setSystemPanelLoadProgress(0.16, "Comparing");
        await yieldToMain();
        const bufB = await readFileAsArrayBufferWithProgress(f2, compareReadAbort.signal, (frac) => {
          setSystemPanelLoadProgress(0.16 + 0.15 * frac, "Comparing");
        });
        setSystemPanelLoadProgress(0.32, "Comparing");
        await yieldToMain();
        const { text: rawA } = decodeBuffer(bufA, "system", enc);
        setSystemPanelLoadProgress(0.38, "Comparing");
        await yieldToMain();
        const { text: rawB } = decodeBuffer(bufB, "system", enc);
        setSystemPanelLoadProgress(0.45, "Comparing");
        await yieldToMain();
        const recA = parseMsInfoDocumentWithRecovery(rawA);
        setSystemPanelLoadProgress(0.55, "Comparing");
        await yieldToMain();
        const recB = parseMsInfoDocumentWithRecovery(rawB);
        setSystemPanelLoadProgress(0.6, "Comparing");
        await yieldToMain();
        const dataA = getMsInfoStructuredDataFromRecovery(recA);
        const dataB = getMsInfoStructuredDataFromRecovery(recB);
        const canStructure = !!(dataA && dataB);
        /** @type {ReturnType<typeof diffMsInfoKvsData>} */
        const diffKvs = canStructure
          ? diffMsInfoKvsData(/** @type {any} */ (dataA), /** @type {any} */ (dataB))
          : { onlyA: [], onlyB: [], changed: [], nA: 0, nB: 0 };
        setSystemPanelLoadProgress(0.68, "Comparing");
        await yieldToMain();
        const xmlRepA =
          recA.doc && Array.isArray(/** @type {any} */ (recA.doc)._msinfoRepairs)
            ? /** @type {any} */ (recA.doc)._msinfoRepairs
            : [];
        const xmlRepB =
          recB.doc && Array.isArray(/** @type {any} */ (recB.doc)._msinfoRepairs)
            ? /** @type {any} */ (recB.doc)._msinfoRepairs
            : [];
        const sumA = canStructure && dataA ? extractSystemSummary(/** @type {any} */ (dataA)) : null;
        const sumB = canStructure && dataB ? extractSystemSummary(/** @type {any} */ (dataB)) : null;

        let nPairs = 0;
        if (compareStructured) {
          compareStructured.hidden = false;
          if (canStructure) {
            nPairs = buildSystemCompareStackedView(
              compareStructured,
              f1.name,
              f2.name,
              sumA,
              sumB,
              recA.notes,
              recB.notes,
              xmlRepA,
              xmlRepB,
            );
            requestAnimationFrame(() => {
              try {
                compareStructured.scrollIntoView({ block: "nearest", behavior: "smooth" });
              } catch {
                /* */
              }
            });
          } else {
            compareStructured.innerHTML = `<p class="system-compare-report__warn">The exports could not be parsed the same way as a normal report. Open Raw line diff, or re-save as .nfo and match Encoding.</p>`;
          }
        }
        setSystemPanelLoadProgress(0.8, "Comparing");
        await yieldToMain();
        if (compareRawDetails) {
          if (!canStructure) compareRawDetails.open = true;
          else compareRawDetails.open = nPairs === 0;
        }

        const textA = displayTextForSystemCompare(bufA, enc);
        const textB = displayTextForSystemCompare(bufB, enc);
        const truncA = textA.length > SYSTEM_COMPARE_MAX_CHARS;
        const truncB = textB.length > SYSTEM_COMPARE_MAX_CHARS;
        const sa = textA.slice(0, SYSTEM_COMPARE_MAX_CHARS);
        const sb = textB.slice(0, SYSTEM_COMPARE_MAX_CHARS);
        if (compareOut) {
          compareOut.textContent = lineDiffLines(sa.split("\n"), sb.split("\n"));
        }
        setSystemPanelLoadProgress(0.94, "Comparing");
        await yieldToMain();
        let msg = `Compared “${f1.name}” (1) vs “${f2.name}” (2).`;
        if (canStructure) {
          msg += ` ${nPairs} report section group(s), stacked. ${diffKvs.changed.length} item row(s) differ, ${diffKvs.onlyA.length} only in file 1, ${diffKvs.onlyB.length} only in file 2.`;
        }
        if (truncA || truncB) {
          msg += ` Raw line view is limited to the first ${SYSTEM_COMPARE_MAX_CHARS.toLocaleString()} characters per side.`;
        } else if (canStructure && nPairs > 0) {
          msg += " For each group, the first full card is from file 1, the next from file 2.";
        } else {
          msg += " See “Raw line diff” below to compare the raw text.";
        }
        setSystemPanelLoadProgress(0.99, "Comparing");
        await finishSystemPanelLoadJobAsync();
        if (compareStatus) compareStatus.textContent = msg;
      } catch (e) {
        console.error(e);
        resetSystemPanelLoadJobOnError();
        if (compareStatus) compareStatus.textContent = "Could not compare these files.";
        if (compareOut) compareOut.textContent = "";
        if (compareStructured) {
          compareStructured.hidden = false;
          compareStructured.innerHTML = `<p class="system-compare-report__warn">Could not read one of the files.</p>`;
        }
      } finally {
        if (compareRun instanceof HTMLButtonElement) compareRun.disabled = false;
      }
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
    const timeRangeEl = panel.querySelector(".analyzer-time-range");
    const btnClearAll = panel.querySelector(".btn-clear-all");
    const btnExportCsv = panel.querySelector(".btn-gpu-export-csv");
    const btnExportRaw = panel.querySelector(".btn-gpu-export-raw");

    /** @type {{ id: string, name: string, buffer: ArrayBuffer, label: string, text: string, parsed: ReturnType<typeof parseSensorCsv> | null }[]} */
    let logs = [];
    let nextId = 1;
    /** @type {string[] | null} */
    let savedMetricPick = null;
    /** @type {ReturnType<typeof createLanguageAdderSnapshot> | null} */
    let lastLangAdder = null;

    // Language Adder for GPU-Z tab (metric names / units / localized headers).
    let btnLangAdder = null;
    if (toolbar) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn btn--ghost btn-lang-adder";
      b.textContent = "Language Adder";
      b.title = "Export unknown (untranslated) tokens to extend offline language support";
      b.disabled = true;
      b.addEventListener("click", () => {
        if (!lastLangAdder) {
          window.alert("Load and analyze GPU-Z logs first.");
          return;
        }
        const fb = (logs[0]?.name || "GPUZ").replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 80);
        const base = languageAdderExportBasename(lastLangAdder, fb);
        downloadTextAsFile(`${base}.language-adder.txt`, buildLanguageAdderTxtFromSnapshot(lastLangAdder), "text/plain;charset=utf-8");
      });
      toolbar.appendChild(b);
      btnLangAdder = b;
    }

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

    function refreshLanguageAdder() {
      try {
        const toks = [];
        for (const log of logs) {
          if (!log.parsed) continue;
          toks.push(...(log.parsed.cols || []).map((c) => c.name).filter(Boolean));
          // Also include the raw header line if present (some localized GPU-Z exports).
          if (log.text) toks.push(...String(log.text).slice(0, 5000).split(/[,;\r\n\t]+/g).slice(0, 400));
        }
        lastLangAdder = createLanguageAdderSnapshot({
          fileName: logs[0]?.name || "GPU-Z",
          encodingLabel: logs[0]?.label || "auto",
          source: "gpu",
          tokens: toks,
        });
        if (btnLangAdder) btnLangAdder.disabled = Object.keys(lastLangAdder.unknownTokens || {}).length === 0;
      } catch {
        lastLangAdder = null;
        if (btnLangAdder) btnLangAdder.disabled = true;
      }
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
        let minY = pts[0].y;
        let maxY = pts[0].y;
        for (let i = 1; i < pts.length; i++) {
          const y = pts[i].y;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
        out.push({
          label: log.name,
          color: CHART_COLORS[li % CHART_COLORS.length],
          unit: col.unit,
          pts,
          minY,
          maxY,
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

    /** @param {number | null} ms @param {string} raw */
    function formatSensorCaptureInstant(ms, raw) {
      if (ms != null && Number.isFinite(ms)) {
        try {
          return new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" });
        } catch {
          /* fall through */
        }
      }
      return raw && raw.trim().length ? raw.trim() : "—";
    }

    function renderAnalyzerTimeRange() {
      if (!timeRangeEl) return;
      if (!logs.length) {
        timeRangeEl.hidden = true;
        timeRangeEl.innerHTML = "";
        return;
      }
      /** @type {string[]} */
      const blocks = [];
      for (const log of logs) {
        const tr = log.parsed?.timeRange;
        if (!tr) continue;
        const startDisp = formatSensorCaptureInstant(tr.startMs, tr.startRaw);
        const endDisp = formatSensorCaptureInstant(tr.endMs, tr.endRaw);
        const colHint = esc(tr.timeColumnLabel || "Time");
        const startSafe = esc(startDisp);
        const endSafe = esc(endDisp);
        const startInner =
          tr.startMs != null && Number.isFinite(tr.startMs)
            ? `<time datetime="${esc(new Date(tr.startMs).toISOString())}">${startSafe}</time>`
            : `<span>${startSafe}</span>`;
        const endInner =
          tr.endMs != null && Number.isFinite(tr.endMs)
            ? `<time datetime="${esc(new Date(tr.endMs).toISOString())}">${endSafe}</time>`
            : `<span>${endSafe}</span>`;
        blocks.push(`<div class="analyzer-time-range__file">
          ${logs.length > 1 ? `<div class="analyzer-time-range__filename">${esc(log.name)}</div>` : ""}
          <p class="analyzer-time-range__column"><span class="analyzer-time-range__muted">${colHint}</span></p>
          <dl class="analyzer-time-range__dl">
            <div class="analyzer-time-range__row"><dt>Start</dt><dd>${startInner}</dd></div>
            <div class="analyzer-time-range__row"><dt>End</dt><dd>${endInner}</dd></div>
          </dl>
        </div>`);
      }
      if (!blocks.length) {
        timeRangeEl.hidden = true;
        timeRangeEl.innerHTML = "";
        return;
      }
      const title = logs.length > 1 ? "Time range per log" : "Time range";
      timeRangeEl.hidden = false;
      timeRangeEl.innerHTML = `<h4 class="analyzer-time-range__title">${title}</h4>${blocks.join("")}`;
    }

    function syncUi() {
      const n = logs.length;
      const subsampled = logs.some((l) => l.parsed && "truncated" in l.parsed && l.parsed.truncated);
      meta.textContent = n
        ? `${n} log${n === 1 ? "" : "s"} · charts, CSV export, raw bundle, correlation & soft checks${
            subsampled ? " · large file subsampled for analysis (uniform stride)" : ""
          }`
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
      renderAnalyzerTimeRange();
      redraw();
      refreshLanguageAdder();
      try {
        gpuHubSnapshot = { logs: logs.map((l) => ({ name: l.name, parsed: l.parsed })) };
      } catch {
        gpuHubSnapshot = null;
      }
      dispatchGpuHubUpdated();
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
      lastLangAdder = null;
      if (btnLangAdder) btnLangAdder.disabled = true;
      gpuHubSnapshot = null;
      dispatchGpuHubUpdated();
      syncUi();
    });
    window.addEventListener("resize", () => {
      if (logs.length) redraw();
    });
    panel.addEventListener("gpuresize", () => {
      if (logs.length) redraw();
    });
  }

  /** EVTX/XML: watched Event IDs for GPU / stability triage (education only). Omit generic ID 0 from matching (too noisy). */
  const EVTX_WATCHED_IDS = /** @type {Set<number>} */ (
    new Set([4101, 10110, 10111, 41, 18, 14, 153, 13, 63, 193, 17, 19, 20, 6008])
  );

  /**
   * Narrative blurbs keyed by ID (counts from file when ids is non-empty).
   * referenceOnly: show “Reference” badge (no Event ID counting; e.g. XID varies by detail field).
   * @type {readonly { ids: readonly number[], title: string, body: string, referenceOnly?: boolean }[]}
   */
  const EVTX_KEY_EVENT_BLURBS = [
    {
      ids: [13, 14],
      title: "nvlddmkm / amdkmdag (IDs 13, 14)",
      body:
        "Display driver stopped responding. Typical causes include unstable clocks, thermals, corrupt drivers, or failing GPU hardware. Compare with LiveKernelEvent / TDR codes and Kernel-Power in the same session.",
    },
    {
      ids: [4101],
      title: "Event ID 4101 (Display)",
      body:
        'Quoted message often includes “Display driver nvlddmkm stopped responding and has successfully recovered.” That is TDR recovery: Windows reset the GPU after it missed a deadline. Common contributors: driver bugs or corruption, overheating, unstable overclock, power delivery to the card, or faulty GPU hardware.',
    },
    {
      ids: [153],
      title: "Event ID 153 (nvlddmkm / Display)",
      body:
        "From the NVIDIA kernel driver stack; often clusters with other Display/TDR entries. Bursts under load warrant checking PCIe power connectors, PSU capacity on 12V GPU rails, thermals, and a clean driver install.",
    },
    {
      ids: [10110, 10111],
      title: "Event ID 10110 / 10111 (Driver Frameworks)",
      body:
        "Microsoft-Windows-DriverFrameworks-UserMode (UMDF): live driver/device failures. Often GPU-related when messages reference nvlddmkm or amdkmdag. Typical next steps: remove drivers with Display Driver Uninstaller (DDU) and clean-install from NVIDIA or AMD; retest at stock clocks. Note: published GPU-troubleshooting IDs are **10110 / 10111**, not unrelated events that happen to look like **10010**.",
    },
    {
      ids: [41, 63],
      title: "Kernel-Power (IDs 41, 63)",
      body:
        'For ID 41, the message often begins “The system has rebooted without cleanly shutting down first.” That flags an unclean shutdown, sometimes seen under heavy GPU load when power delivery fails. Frequently points to PSU limits, failing PSU, loose PCIe / EPS cables, or mains loss; correlate with Event ID 6008 and timestamps.',
    },
    {
      ids: [6008],
      title: "Event ID 6008 (EventLog)",
      body:
        'Often “The previous system shutdown at … was unexpected.” Typically logged after a hard reset or loss of power; commonly appears alongside Kernel-Power 41 for the same incident. Use timing with other entries (not GPU-specific by itself).',
    },
    {
      ids: [17, 18, 19, 20],
      title: "Event ID 17 / 18 / 19 / 20 (WHEA-Logger)",
      body:
        "Windows Hardware Error Architecture reports; wording varies by ID (correctable vs fatal hardware error). Often tied to PCIe links, GPU, RAM, CPU package, or motherboard paths when details list buses or components. Next steps: read the full Message / XML fields, update chipset and BIOS from the OEM, re-seat GPU and RAM, stress-test; persistent WHEA warrants hardware-focused diagnosis.",
    },
    {
      ids: [193],
      title: "LiveKernelEvent / TDR detail (ID 193, …)",
      body:
        "LiveKernelEvent payloads often carry codes such as 0x141, 0x1a8, 0x1b8 (typical TDR-style failures under load). Cross-check hex parameters in XML and Reliability Monitor.",
    },
    {
      ids: [],
      title: "XID errors (NVIDIA)",
      body:
        "Hardware-reported PCIe or GPU memory errors from the NVIDIA driver stack. Use the XID code in the event XML / details with NVIDIA documentation to interpret bus vs VRAM vs power delivery.",
      referenceOnly: true,
    },
  ];

  /**
   * @param {string} block single {@code <Event>…</Event>} slice
   * @param {{ eventId: number | null, provider: string, channel: string, timeIso: string, message: string, confidence: string }[]} events
   */
  function pushParsedXmlEventBlock(block, events) {
    const idM = /<EventID[^>]*>(\d+)<\/EventID>/i.exec(block);
    let provider = "";
    const provOpen = /<Provider\b[^>]*>/i.exec(block);
    if (provOpen) {
      const tag = provOpen[0];
      const p1 = /\bName\s*=\s*"([^"]*)"/i.exec(tag);
      const p2 = p1 ? null : /\bName\s*=\s*'([^']*)'/i.exec(tag);
      if (p1) provider = p1[1] || "";
      else if (p2) provider = p2[1] || "";
    }
    let timeIso = "";
    const tcOpen = /<TimeCreated\b[^>]*>/i.exec(block);
    if (tcOpen) {
      const tag = tcOpen[0];
      const t1 = /\bSystemTime\s*=\s*"([^"]*)"/i.exec(tag);
      const t2 = t1 ? null : /\bSystemTime\s*=\s*'([^']*)'/i.exec(tag);
      if (t1) timeIso = t1[1] || "";
      else if (t2) timeIso = t2[1] || "";
    }
    const channelM = /<Channel[^>]*>([^<]*)<\/Channel>/i.exec(block);
    let message = "";
    const msgBlock = /<RenderingInfo[^>]*>[\s\S]*?<Message[^>]*>([\s\S]*?)<\/Message>/i.exec(block);
    if (msgBlock) message = stripHtmlToText(msgBlock[1]).slice(0, 900);
    if (!message) {
      const dataParts = [];
      const dr = /<Data\b[^>]*>([\s\S]*?)<\/Data>/gi;
      let dm;
      while ((dm = dr.exec(block))) {
        const t = stripHtmlToText(dm[1]).trim();
        if (t) dataParts.push(t);
      }
      if (dataParts.length >= 2 && /^\\\\Device\\/i.test(dataParts[0]))
        message = dataParts.slice(1).join(" · ").slice(0, 900);
      else message = dataParts.slice(0, 8).join(" · ").slice(0, 900);
    }
    const eventId = idM ? Number.parseInt(idM[1], 10) : null;
    if (eventId == null || Number.isNaN(eventId)) return;
    const channel = channelM ? channelM[1].trim() : "";
    events.push({
      eventId,
      provider,
      channel,
      timeIso,
      message,
      confidence: "high",
    });
  }

  /**
   * @param {ArrayBuffer | Uint8Array} buffer
   * @returns {{ eventId: number | null, provider: string, channel: string, timeIso: string, message: string, confidence: string }[]}
   */
  function parseWindowsEventXmlExport(text) {
    /** @type {{ eventId: number | null, provider: string, channel: string, timeIso: string, message: string, confidence: string }[]} */
    const events = [];
    const re = /<Event\b[^>]*>([\s\S]*?)<\/Event>/gi;
    let m;
    while ((m = re.exec(text))) {
      pushParsedXmlEventBlock(m[0], events);
    }
    return events;
  }

  /**
   * Same rows as {@link parseWindowsEventXmlExport} but yields so the tab stays responsive on huge XML exports.
   * @param {string} text
   * @param {AbortSignal} signal
   * @param {(fraction: number) => void} onProgress
   */
  async function parseWindowsEventXmlExportAsync(text, signal, onProgress) {
    /** @type {{ eventId: number | null, provider: string, channel: string, timeIso: string, message: string, confidence: string }[]} */
    const events = [];
    const re = /<Event\b[^>]*>([\s\S]*?)<\/Event>/gi;
    const len = text.length || 1;
    let m;
    let n = 0;
    while ((m = re.exec(text))) {
      signal.throwIfAborted();
      pushParsedXmlEventBlock(m[0], events);
      n++;
      if (n % 80 === 0) {
        onProgress(Math.min(0.98, re.lastIndex / len));
        await yieldToMain();
      }
    }
    onProgress(1);
    return events;
  }

  /** @param {string} html */
  function stripHtmlToText(html) {
    return String(html || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /** @param {Uint8Array} u8 @param {number} pos */
  function readU32le(u8, pos) {
    return u8[pos] | (u8[pos + 1] << 8) | (u8[pos + 2] << 16) | (u8[pos + 3] << 24);
  }

  /** @param {Uint8Array} u8 @param {number} pos */
  function readU16le(u8, pos) {
    return u8[pos] | (u8[pos + 1] << 8);
  }

  /** @param {Uint8Array} u8 @param {number} pos @param {number} len */
  function readAsciiFixed(u8, pos, len) {
    let s = "";
    for (let i = 0; i < len && pos + i < u8.length; i++) s += String.fromCharCode(u8[pos + i]);
    return s;
  }

  /** @param {Uint8Array} u8 @param {number} pos */
  function readU64le(u8, pos) {
    const lo = BigInt(readU32le(u8, pos));
    const hi = BigInt(readU32le(u8, pos + 4));
    return lo | (hi << 32n);
  }

  /** @param {bigint} ft */
  function filetimeToIsoString(ft) {
    try {
      const ms = Number(ft / 10000n - 11644473600000n);
      if (!Number.isFinite(ms)) return "";
      return new Date(ms).toISOString();
    } catch {
      return "";
    }
  }

  /** Max bytes to scan for embedded XML / BinXml text inside a record payload. */
  const EVTX_LITERAL_EVENTID_CAP = 8 * 1024 * 1024;

  /**
   * Event Viewer’s “Date and Time” column uses {@code System TimeCreated} from the rendered XML; it is not always identical to
   * the FILETIME at record offset {@code 0x10}. Prefer this when BinXml still carries a readable {@code TimeCreated} tag.
   * @param {Uint8Array | null | undefined} payload
   * @param {Uint8Array | null | undefined} recordEnvelope
   * @returns {string} ISO string in UTC, or ""
   */
  function extractSystemTimeCreatedIso(payload, recordEnvelope) {
    const reLoose =
      /<TimeCreated\b[^>]{0,1200}?>/i;
    const reSysDq = /\bSystemTime\s*=\s*"([^"]+)"/i;
    const reSysSq = /\bSystemTime\s*=\s*'([^']+)'/i;
    /** @param {string} raw */
    const normalizeMs = (raw) => {
      const t = String(raw || "").trim();
      if (!t) return NaN;
      let ms = Date.parse(t);
      if (!Number.isNaN(ms)) return ms;
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(t) && !/[zZ+\-]\d/.test(t.slice(-6)))
        ms = Date.parse(t + "Z");
      return ms;
    };
    /** @param {Uint8Array} buf */
    const scanDecoded = (buf) => {
      /** Event {@code System}/{@code TimeCreated} for this row lives in the first part of the payload — avoid matching older template copies deeper in the buffer. */
      const max = Math.min(buf.length, 98304);
      const slice = buf.subarray(0, max);
      const attempts = [
        () => new TextDecoder("utf-16le", { fatal: false }).decode(slice),
        () => new TextDecoder("utf-8", { fatal: false }).decode(slice),
      ];
      for (const decode of attempts) {
        let s = "";
        try {
          s = decode();
        } catch {
          continue;
        }
        const mOpen = reLoose.exec(s);
        if (!mOpen) continue;
        const tag = mOpen[0];
        let sm = reSysDq.exec(tag);
        if (!sm) sm = reSysSq.exec(tag);
        if (!sm) {
          const whole = /<TimeCreated\b[^>]*\bSystemTime\s*=\s*"([^"]+)"/i.exec(s);
          if (whole) sm = whole;
        }
        if (!sm) continue;
        const ms = normalizeMs(sm[1]);
        if (!Number.isNaN(ms)) return new Date(ms).toISOString();
      }
      let latin = "";
      const lm = Math.min(slice.length, 262144);
      for (let i = 0; i < lm; i++) latin += String.fromCharCode(slice[i]);
      const mOpenLat = reLoose.exec(latin);
      if (!mOpenLat) return "";
      const tagLat = mOpenLat[0];
      let smLat = reSysDq.exec(tagLat) || reSysSq.exec(tagLat);
      if (!smLat) return "";
      const msLat = normalizeMs(smLat[1]);
      if (!Number.isNaN(msLat)) return new Date(msLat).toISOString();
      return "";
    };

    /** Prefer payload only first — full envelope can include chunk string tables that carry unrelated {@code TimeCreated} text. */
    if (payload?.length) {
      const got = scanDecoded(payload);
      if (got) return got;
    }
    if (recordEnvelope?.length) {
      const got = scanDecoded(recordEnvelope);
      if (got) return got;
    }
    return "";
  }

  /**
   * Locate UTF-16 LE {@code </EventID>} beginning at or after {@code start} within {@code maxScan} bytes.
   * @param {Uint8Array} buf
   * @param {number} start
   * @param {Uint8Array} closeSeq
   * @param {number} maxScan
   */
  function findUtf16SeqFrom(buf, start, closeSeq, maxScan) {
    const lim = Math.min(buf.length, start + maxScan);
    for (let i = start; i + closeSeq.length <= lim; i++) {
      let ok = true;
      for (let j = 0; j < closeSeq.length; j++)
        if (buf[i + j] !== closeSeq[j]) {
          ok = false;
          break;
        }
      if (ok) return i;
    }
    return -1;
  }

  /**
   * UTF-16 LE: {@code <EventID ...> … </EventID>} where the inner value is either UTF-16 digits **or** BinXml UInt16
   * ({@code 0x06} + LE word) — Windows often stores IDs as typed BinXml inside the element, not as literal digit text.
   * Always requires a UTF-16 {@code </EventID>} closing tag after the value region (within a bounded scan).
   * @param {Uint8Array} buf
   * @returns {number | null}
   */
  function extractLiteralEventIdUtf16ClosedTags(buf) {
    const len = buf.length;
    /** `<EventID` as UTF-16 LE (leading {@code <} included). */
    const openPrefix = new Uint8Array([
      0x3c, 0, 0x45, 0, 0x76, 0, 0x65, 0, 0x6e, 0, 0x74, 0, 0x49, 0, 0x44, 0,
    ]);
    /** `</EventID>` as UTF-16 LE */
    const closeSeq = new Uint8Array([
      0x3c, 0, 0x2f, 0, 0x45, 0, 0x76, 0, 0x65, 0, 0x6e, 0, 0x74, 0, 0x49, 0, 0x44, 0, 0x3e, 0,
    ]);
    for (let i = 0; i + openPrefix.length <= len; i++) {
      let prefixOk = true;
      for (let j = 0; j < openPrefix.length; j++)
        if (buf[i + j] !== openPrefix[j]) {
          prefixOk = false;
          break;
        }
      if (!prefixOk) continue;
      let k = i + openPrefix.length;
      const cap = Math.min(len, i + 900);
      let contentStart = -1;
      for (; k + 1 < cap; k++) {
        if (buf[k] === 0x3e && buf[k + 1] === 0) {
          contentStart = k + 2;
          break;
        }
      }
      if (contentStart < 0) continue;
      let p = contentStart;
      while (p + 1 < len) {
        const lo = buf[p];
        const hi = buf[p + 1];
        if (hi !== 0 || (lo !== 0x20 && lo !== 0x09 && lo !== 0x0a && lo !== 0x0d)) break;
        p += 2;
      }
      /** BinXml UInt16 value token (matches Event Viewer XML → same number as rendered {@code <EventID>153</EventID>}). */
      if (p + 3 <= len && buf[p] === 0x06) {
        const idBin = buf[p + 1] | (buf[p + 2] << 8);
        if (idBin >= 1 && idBin <= 65535) {
          const closePos = findUtf16SeqFrom(buf, p + 3, closeSeq, 8192);
          if (closePos >= 0) return idBin;
        }
      }
      let num = 0;
      let digits = 0;
      while (p + 1 < len && digits < 9) {
        const lo = buf[p];
        const hi = buf[p + 1];
        if (hi !== 0 || lo < 0x30 || lo > 0x39) break;
        num = num * 10 + (lo - 0x30);
        digits++;
        p += 2;
      }
      if (digits === 0 || num <= 0) continue;
      while (p + 1 < len) {
        const lo = buf[p];
        const hi = buf[p + 1];
        if (hi !== 0 || (lo !== 0x20 && lo !== 0x09 && lo !== 0x0a && lo !== 0x0d)) break;
        p += 2;
      }
      if (p + closeSeq.length > len) continue;
      let closeOk = true;
      for (let j = 0; j < closeSeq.length; j++)
        if (buf[p + j] !== closeSeq[j]) {
          closeOk = false;
          break;
        }
      if (closeOk) return num;
    }
    return null;
  }

  /**
   * ASCII / UTF-8 bytes: {@code <EventID>digits</EventID>} with verified closing tag (case-insensitive name).
   * @param {Uint8Array} buf
   * @returns {number | null}
   */
  function extractLiteralEventIdAsciiClosedTags(buf) {
    const len = buf.length;
    /** @param {number} c */
    const asciiLower = (c) => (c >= 0x41 && c <= 0x5a ? c | 0x20 : c);
    const name = "eventid";
    for (let i = 0; i + 24 < len; i++) {
      if (buf[i] !== 0x3c) continue;
      let ok = true;
      for (let j = 0; j < name.length; j++) {
        if (asciiLower(buf[i + 1 + j]) !== name.charCodeAt(j)) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      let k = i + 1 + name.length;
      while (k < len && buf[k] !== 0x3e) k++;
      if (k >= len || buf[k] !== 0x3e) continue;
      k++;
      let num = 0;
      let digits = 0;
      while (k < len && digits < 9) {
        const c = buf[k];
        if (c < 0x30 || c > 0x39) break;
        num = num * 10 + (c - 0x30);
        digits++;
        k++;
      }
      if (digits === 0 || num <= 0) {
        /** ASCII {@code <EventID>} — inner value may be BinXml UInt16 ({@code 0x06} + LE) before {@code </EventID>}. */
        if (k + 3 <= len && buf[k] === 0x06) {
          const idBin = buf[k + 1] | (buf[k + 2] << 8);
          if (idBin >= 1 && idBin <= 65535) {
            const lim = Math.min(len, k + 3 + 640);
            for (let i = k + 3; i + 2 + name.length + 1 <= lim; i++) {
              if (buf[i] !== 0x3c || buf[i + 1] !== 0x2f) continue;
              let cok = true;
              for (let j = 0; j < name.length; j++) {
                if (asciiLower(buf[i + 2 + j]) !== name.charCodeAt(j)) {
                  cok = false;
                  break;
                }
              }
              if (cok && buf[i + 2 + name.length] === 0x3e) return idBin;
            }
          }
        }
        continue;
      }
      if (k + 2 + name.length + 1 > len) continue;
      if (buf[k] !== 0x3c || buf[k + 1] !== 0x2f) continue;
      let closeOk = true;
      for (let j = 0; j < name.length; j++) {
        if (asciiLower(buf[k + 2 + j]) !== name.charCodeAt(j)) {
          closeOk = false;
          break;
        }
      }
      if (!closeOk || buf[k + 2 + name.length] !== 0x3e) continue;
      return num;
    }
    return null;
  }

  /**
   * ASCII {@code <EventID>} islands are often embedded as single-byte XML in EVTX payloads; UTF-8/UTF-16 decoders break on
   * null bytes, so map each byte to a Latin-1 code unit and regex (same technique as many EVTX viewers).
   * @param {Uint8Array} buf
   * @returns {number | null}
   */
  function extractLiteralEventIdLatin1Regex(buf) {
    const max = Math.min(buf.length, 2 * 1024 * 1024);
    let s = "";
    for (let i = 0; i < max; i++) s += String.fromCharCode(buf[i]);
    /** Prefer {@code System} block so we never latch onto unrelated {@code EventID} text elsewhere in the chunk. */
    const patterns = [
      /<System\b[^>]*>[\s\S]{0,14000}?<EventID\b[^>]{0,600}>\s*(\d{1,9})\s*<\/EventID>/i,
      /<EventID\b[^>]{0,600}>\s*(\d{1,9})\s*<\/EventID>/i,
    ];
    for (const re of patterns) {
      const m = re.exec(s);
      if (m) {
        const v = Number.parseInt(m[1], 10);
        if (Number.isFinite(v) && v > 0) return v;
      }
    }
    return null;
  }

  /**
   * BinXml stores {@code EventID} as a NormalSubstitution UInt16 ({@code 0x06} + LE word). The ASCII {@code <EventID>}
   * tags are often **absent** from the raw record bytes — correlate each candidate UInt16 with the UTF-16 element name
   * {@code EventID} appearing shortly before it (same approach as structured EVTX parsers).
   * @param {Uint8Array} buf
   * @returns {number | null}
   */
  function extractEventIdBinXmlSubstitutionAnchored(buf) {
    const len = buf.length;
    /** UTF-16 LE {@code EventID} name token (no angle brackets). */
    const nameUtf16 = new Uint8Array([
      0x45, 0, 0x76, 0, 0x65, 0, 0x6e, 0, 0x74, 0, 0x49, 0, 0x44, 0,
    ]);
    /**
     * BinXml may place other opcode bytes between the UInt16 value and a UTF-16 {@code </EventID>}; requiring an
     * immediate close tag dropped every candidate (blank table). Prefer {@code EventID}-name proximity; optional
     * verification when a UTF-16 close tag appears within range.
     */
    const closeSeq = new Uint8Array([
      0x3c, 0, 0x2f, 0, 0x45, 0, 0x76, 0, 0x65, 0, 0x6e, 0, 0x74, 0, 0x49, 0, 0x44, 0, 0x3e, 0,
    ]);
    /** @type {{ id: number, gap: number, verified: boolean }[]} */
    const hits = [];
    for (let p = 0; p + 3 < len; p++) {
      if (buf[p] !== 0x06) continue;
      const id = buf[p + 1] | (buf[p + 2] << 8);
      if (id < 1 || id > 65535) continue;
      const backLo = Math.max(0, p - 4096);
      let nameEnd = -1;
      for (let i = backLo; i + nameUtf16.length <= p; i++) {
        let ok = true;
        for (let j = 0; j < nameUtf16.length; j++)
          if (buf[i + j] !== nameUtf16[j]) {
            ok = false;
            break;
          }
        if (ok) nameEnd = Math.max(nameEnd, i + nameUtf16.length);
      }
      if (nameEnd >= 0) {
        const gap = p - nameEnd;
        /** Chunk templates may insert many BinXml tokens between name and substitution — keep gap generous. */
        if (gap >= 0 && gap <= 4096) {
          const verified = findUtf16SeqFrom(buf, p, closeSeq, 16384) >= 0;
          hits.push({ id, gap, verified });
        }
      }
    }
    if (!hits.length) return null;
    hits.sort((a, b) => {
      if (a.verified !== b.verified) return a.verified ? -1 : 1;
      const g = a.gap - b.gap;
      if (g !== 0) return g;
      const wa = EVTX_WATCHED_IDS.has(a.id) ? 0 : 1;
      const wb = EVTX_WATCHED_IDS.has(b.id) ? 0 : 1;
      if (wa !== wb) return wa - wb;
      return a.id - b.id;
    });
    return hits[0].id;
  }

  /**
   * Many records store System XML only as UTF-16 template text; Latin1 regex never sees {@code <EventID>}.
   * @param {Uint8Array} buf
   * @returns {number | null}
   */
  function extractLiteralEventIdUtf16DecodedRegex(buf) {
    const max = Math.min(buf.length, EVTX_LITERAL_EVENTID_CAP);
    const s = new TextDecoder("utf-16le", { fatal: false }).decode(buf.subarray(0, max));
    const patterns = [
      /<System\b[^>]*>[\s\S]{0,28000}?<EventID\b[^>]{0,600}>\s*(\d{1,9})\s*<\/EventID>/i,
      /<EventID\b[^>]{0,600}>\s*(\d{1,9})\s*<\/EventID>/i,
    ];
    for (const re of patterns) {
      const m = re.exec(s);
      if (m) {
        const v = Number.parseInt(m[1], 10);
        if (Number.isFinite(v) && v > 0) return v;
      }
    }
    return null;
  }

  /**
   * Event ID from embedded XML / BinXml {@code EventID}: Latin1 ASCII regex first, then UTF-16 / ASCII closed-tag walkers,
   * BinXml {@code 0x06} inside the element, then UTF-16 / UTF-8 decode regex.
   * @param {Uint8Array} payload
   * @returns {number | null}
   */
  function extractLiteralEventIdFromEmbeddedXml(payload) {
    if (!payload.length) return null;
    const max = Math.min(payload.length, EVTX_LITERAL_EVENTID_CAP);
    const buf = payload.subarray(0, max);
    let n = extractLiteralEventIdLatin1Regex(buf);
    if (n != null) return n;
    n = extractLiteralEventIdUtf16DecodedRegex(buf);
    if (n != null) return n;
    n = extractLiteralEventIdUtf16ClosedTags(buf);
    if (n != null) return n;
    n = extractEventIdBinXmlSubstitutionAnchored(buf);
    if (n != null) return n;
    n = extractLiteralEventIdAsciiClosedTags(buf);
    if (n != null) return n;
    const re = /<EventID\b[^>]*>\s*(\d{1,9})\s*<\/EventID>/i;
    const s16 = new TextDecoder("utf-16le", { fatal: false }).decode(buf);
    let m = re.exec(s16);
    if (m) {
      const v = Number.parseInt(m[1], 10);
      if (Number.isFinite(v) && v > 0) return v;
    }
    const s8 = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    m = re.exec(s8);
    if (m) {
      const v = Number.parseInt(m[1], 10);
      if (Number.isFinite(v) && v > 0) return v;
    }
    return null;
  }

  /**
   * Human-readable line from {@code EventData} for the Notes column (nvlddmkm: usually the non–device-path {@code Data}).
   * @param {Uint8Array} payload
   * @returns {string}
   */
  function extractEvtxEventDataNotes(payload) {
    const max = Math.min(payload.length, EVTX_LITERAL_EVENTID_CAP);
    const buf = payload.subarray(0, max);
    /** @param {string} s */
    const collect = (s) => {
      /** @type {string[]} */
      const out = [];
      const re = /<Data\b[^>]*>([\s\S]*?)<\/Data>/gi;
      let m;
      while ((m = re.exec(s))) {
        const t = stripHtmlToText(m[1]).trim();
        if (t) out.push(t);
      }
      return out;
    };
    const latinMax = Math.min(buf.length, 2 * 1024 * 1024);
    let latin = "";
    for (let i = 0; i < latinMax; i++) latin += String.fromCharCode(buf[i]);
    let parts = collect(latin);
    if (!parts.length) parts = collect(new TextDecoder("utf-16le", { fatal: false }).decode(buf));
    if (!parts.length) parts = collect(new TextDecoder("utf-8", { fatal: false }).decode(buf));
    if (!parts.length) return "";
    const devPath = /^\\\\Device\\/i;
    if (parts.length >= 2 && devPath.test(parts[0]) && parts[1]) return parts[1].slice(0, 380);
    return parts[parts.length - 1].slice(0, 380);
  }

  /** Pull Provider {@code Name} or detect {@code nvlddmkm} from binary / UTF-16 fragments. */
  function extractProviderFromEvtxBinPayload(payload) {
    const len = Math.min(payload.length, 98304);
    const u = payload.subarray(0, len);
    const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(u);
    const utf16 = new TextDecoder("utf-16le", { fatal: false }).decode(u);
    for (const block of [utf8, utf16]) {
      const pm =
        /<Provider\b[^>]*\bName\s*=\s*"([^"]*)"|<Provider\b[^>]*\bName\s*=\s*'([^']*)'/i.exec(block);
      if (pm) return (pm[1] || pm[2] || "").trim();
    }
    for (let i = 0; i + 8 <= u.length; i++) {
      if (
        u[i] === 0x6e &&
        u[i + 1] === 0x76 &&
        u[i + 2] === 0x6c &&
        u[i + 3] === 0x64 &&
        u[i + 4] === 0x64 &&
        u[i + 5] === 0x6d &&
        u[i + 6] === 0x6b &&
        u[i + 7] === 0x6d
      )
        return "nvlddmkm";
    }
    const needleNv = new Uint8Array([
      0x6e, 0, 0x76, 0, 0x6c, 0, 0x64, 0, 0x64, 0, 0x6d, 0, 0x6b, 0, 0x6d, 0,
    ]);
    outer: for (let i = 0; i + needleNv.length <= u.length; i++) {
      for (let j = 0; j < needleNv.length; j++) if (u[i + j] !== needleNv[j]) continue outer;
      return "nvlddmkm";
    }
    return "";
  }

  /**
   * Latin1 {@code <Channel>...</Channel>} from raw bytes (no UTF decoding).
   * @param {Uint8Array} buf
   */
  function extractChannelLatin1(buf) {
    const mx = Math.min(buf.length, 2 * 1024 * 1024);
    let lat = "";
    for (let i = 0; i < mx; i++) lat += String.fromCharCode(buf[i]);
    let cm = /<Channel\b[^>]{0,240}>([^<]{1,200})<\/Channel>/i.exec(lat);
    if (!cm) cm = /<Channel[^>]*>([^<]*)<\/Channel>/i.exec(lat);
    return cm ? stripHtmlToText(cm[1]).trim() : "";
  }

  /** Channel text when the record template is UTF-16 (Latin1 channel regex never fires). */
  function extractChannelFromUtf16Template(buf) {
    const mx = Math.min(buf.length, 2 * 1024 * 1024);
    const s = new TextDecoder("utf-16le", { fatal: false }).decode(buf.subarray(0, mx));
    const cm = /<Channel\b[^>]{0,320}>\s*([^<]{1,240})\s*<\/Channel>/i.exec(s);
    return cm ? stripHtmlToText(cm[1]).trim() : "";
  }

  /**
   * Strip mis-decoded tails (full-buffer UTF-16 often picks up garbage after the real ASCII line).
   * @param {string} s
   */
  function sanitizeEvtxDetailVisibleLine(s) {
    let t = String(s || "").replace(/\uFFFD/g, "").trim();
    const lead = /^\s*([\x09\x20-\x7E]+)/.exec(t);
    if (lead && lead[1].length >= 10) t = lead[1].trim();
    return t.length > 380 ? t.slice(0, 380) : t;
  }

  /** UTF-16 LE bytes for {@code ascii} (ASCII code units, high byte 0 per char). */
  function utf16LeAsciiPattern(ascii) {
    const u = new Uint8Array(ascii.length * 2);
    for (let i = 0; i < ascii.length; i++) {
      u[i * 2] = ascii.charCodeAt(i) & 0xff;
      u[i * 2 + 1] = 0;
    }
    return u;
  }

  /** @param {Uint8Array} buf @param {number} idx index of UTF-16 LE ASCII run start */
  function readUtf16AsciiPrintableRun(buf, idx, maxOut) {
    let out = "";
    for (let off = idx; off + 1 < buf.length && out.length < maxOut; ) {
      const lo = buf[off];
      const hi = buf[off + 1];
      off += 2;
      if (hi !== 0) break;
      if (lo === 0x09 || lo === 0x20 || (lo >= 0x21 && lo <= 0x7e)) out += String.fromCharCode(lo);
      else break;
    }
    return sanitizeEvtxDetailVisibleLine(out);
  }

  /**
   * Locate UTF-16 LE ASCII substring without decoding the whole record (avoids alignment garbage).
   * @param {Uint8Array} buf @param {Uint8Array} pat
   */
  function findUtf16AsciiPattern(buf, pat) {
    outer: for (let i = 0; i + pat.length <= buf.length; i++) {
      for (let j = 0; j < pat.length; j++)
        if (buf[i + j] !== pat[j]) continue outer;
      return i;
    }
    return -1;
  }

  /** nvlddmkm often embeds TDR wording as UTF-16 strings without intact {@code <Data>} XML wrappers. */
  function extractNvlddmkmDetailHeuristic(buf) {
    const max = Math.min(buf.length, EVTX_LITERAL_EVENTID_CAP);
    const sub = buf.subarray(0, max);
    /** Prefer aligned UTF-16 ASCII needles — matches Event Viewer message bytes. */
    const utf16Starts = [
      utf16LeAsciiPattern("GPU recovery action changed from "),
      utf16LeAsciiPattern("Restarting TDR occurred on GPUID:"),
      utf16LeAsciiPattern("Reset TDR occurred on GPUID:"),
      utf16LeAsciiPattern("Resetting TDR occurred on GPUID:"),
      utf16LeAsciiPattern("GpuRcReset TDR occurred on GPUID:"),
      utf16LeAsciiPattern("Error occurred on GPUID: "),
      utf16LeAsciiPattern("Error occurred on GPUID:"),
    ];
    for (const pat of utf16Starts) {
      const ix = findUtf16AsciiPattern(sub, pat);
      if (ix >= 0) {
        const line = readUtf16AsciiPrintableRun(sub, ix, 220);
        if (line.length >= 8) return line;
      }
    }
    const s16 = new TextDecoder("utf-16le", { fatal: false }).decode(sub);
    const tight = [
      /GPU recovery action changed from 0x[0-9a-f]+\s*\([^)]+\)\s+to\s+0x[0-9a-f]+\s*\([^)]+\)/i,
      /(?:Restarting|Resetting|Reset)\s+TDR occurred on\s+GPUID\s*:\s*\d+/i,
      /GpuRcReset TDR occurred on\s+GPUID\s*:\s*\d+/i,
      /Error occurred on GPUID\s*:\s*\d+/i,
    ];
    for (const re of tight) {
      const m = s16.match(re);
      if (m) return sanitizeEvtxDetailVisibleLine(m[0]);
    }
    let latin = "";
    for (let i = 0; i < max; i++) latin += String.fromCharCode(sub[i]);
    for (const re of tight) {
      const m = latin.match(re);
      if (m) return sanitizeEvtxDetailVisibleLine(m[0]);
    }
    return "";
  }

  /** Detect nvlddmkm bytes when {@code provider} isn’t filled yet from XML scan. */
  function evtxBlobContainsNvlddmkm(buf) {
    if (!buf?.length) return false;
    const lim = Math.min(buf.length, 786432);
    const slice = buf.subarray(0, lim);
    const ascii = new Uint8Array([0x6e, 0x76, 0x6c, 0x64, 0x64, 0x6d, 0x6b, 0x6d]);
    outer: for (let i = 0; i + ascii.length <= slice.length; i++) {
      for (let j = 0; j < ascii.length; j++) if (slice[i + j] !== ascii[j]) continue outer;
      return true;
    }
    const u16 = utf16LeAsciiPattern("nvlddmkm");
    return findUtf16AsciiPattern(slice, u16) >= 0;
  }

  /**
   * Many NVIDIA System events never embed the literal provider name — Event Viewer resolves it from metadata.
   * Offline {@code .evtx} often still carries UTF-16 kernel message bytes ({@code GPUID}, TDR, recovery). Treat like {@code nvlddmkm}.
   * @param {Uint8Array} payload
   * @param {Uint8Array | null | undefined} recordEnvelope
   */
  function nvKernelBinarySignalsNvlddmkmProvider(payload, recordEnvelope) {
    const blobs = [payload, recordEnvelope].filter((b) => b?.length);
    for (const buf of blobs) {
      if (extractNvlddmkmDetailHeuristic(buf)) return true;
      const sub = buf.subarray(0, Math.min(buf.length, EVTX_LITERAL_EVENTID_CAP));
      const extraNeedles = [
        "GPUID:",
        "GPUID: ",
        "TDR occurred",
        "GpuRcReset",
        "GPU recovery",
      ];
      for (const n of extraNeedles) {
        if (findUtf16AsciiPattern(sub, utf16LeAsciiPattern(n)) >= 0) return true;
      }
    }
    return false;
  }

  /**
   * Modern {@code .evtx} stores Event IDs as BinXml **NormalSubstitution** ({@code 0x0D}+index), resolved against chunk
   * templates — not as raw UInt16 {@code 153} in the record slice. When literal XML / substitution parsing can’t recover
   * the number, map **153** / **14** from the same driver detail strings Event Viewer shows in exported XML (TDR vs recovery).
   * @param {string} text
   * @returns {number | null}
   */
  function inferNvlddmkmEventIdFromDriverDetail(text) {
    const s = String(text || "").trim();
    if (!s) return null;
    if (/gpu\s+recovery\s+action\s+changed\s+from/i.test(s)) return 14;
    if (
      /restart(?:ing)?\s+tdr\s+occurred|reset(?:ting)?\s+tdr\s+occurred|\breset\s+tdr\s+occurred|gpurcreset\s+tdr/i.test(
        s,
      ) ||
      /error\s+occurred\s+on\s+gpuid/i.test(s)
    )
      return 153;
    return null;
  }

  /**
   * Best-effort metadata from EVTX BinXml payload (often contains embedded XML fragments).
   * @param {Uint8Array} payload BinXml fragment ({@code off + 0x18} … {@code off + sz - 4}) as in typical parsers.
   * @param {Uint8Array | null | undefined} recordEnvelope Optional full record ({@code off … off + sz}), including headers —
   *   some builds place readable XML islands only in this span.
   */
  function extractWindowsEventFromBinPayload(payload, recordEnvelope) {
    /** Prefer literal XML text in the blob; falls back to BinXml substitution tied to an EventID token only. */
    /** @type {number | null} */
    let eventId = extractLiteralEventIdFromEmbeddedXml(payload);
    if (eventId == null && recordEnvelope && recordEnvelope.length)
      eventId = extractLiteralEventIdFromEmbeddedXml(recordEnvelope);

    let confidence = eventId != null ? "high" : "low";
    let provider = "";
    let channel = "";
    let message = "";

    /** @param {string} s */
    const scan = (s) => {
      const pm = /<Provider[^>]*\bName\s*=\s*"([^"]*)"|<Provider[^>]*\bName\s*=\s*'([^']*)'/i.exec(s);
      if (pm && !provider) provider = (pm[1] || pm[2] || "").trim();
      const cm = /<Channel[^>]*>([^<]*)<\/Channel>/i.exec(s);
      if (cm && !channel) channel = cm[1].trim();
      const mm = /<Message[^>]*>([\s\S]{0,1200}?)<\/Message>/i.exec(s);
      if (mm && !message) message = stripHtmlToText(mm[1]).slice(0, 700);
      if (/nvlddmkm.*(recover|responding|stopped)/i.test(s) && !message)
        message = "Driver / nvlddmkm text pattern in record (see full log in Event Viewer).";
    };

    for (const blob of [
      payload,
      recordEnvelope && recordEnvelope.length ? recordEnvelope : null,
    ]) {
      if (!blob?.length) continue;
      scan(new TextDecoder("utf-8", { fatal: false }).decode(blob));
      scan(new TextDecoder("utf-16le", { fatal: false }).decode(blob));
      if (!channel && blob.length) {
        const ch = extractChannelLatin1(blob);
        if (ch) channel = ch;
      }
      if (!channel && blob.length) {
        const chu = extractChannelFromUtf16Template(blob);
        if (chu) channel = chu;
      }
    }

    if (!provider && payload.length) provider = extractProviderFromEvtxBinPayload(payload);
    if (!provider && recordEnvelope?.length) provider = extractProviderFromEvtxBinPayload(recordEnvelope);

    if (!/nvlddmkm|amdkmdag/i.test(provider || "") && nvKernelBinarySignalsNvlddmkmProvider(payload, recordEnvelope))
      provider = "nvlddmkm";

    if (!channel && /nvlddmkm|amdkmdag/i.test(provider))
      channel = "System";

    if (!message && payload.length) {
      let dataHint = extractEvtxEventDataNotes(payload);
      if (!dataHint && recordEnvelope?.length) dataHint = extractEvtxEventDataNotes(recordEnvelope);
      if (dataHint) message = sanitizeEvtxDetailVisibleLine(dataHint);
    }
    if (!message && /nvlddmkm|amdkmdag/i.test(provider)) {
      let hint = extractNvlddmkmDetailHeuristic(payload);
      if (!hint && recordEnvelope?.length) hint = extractNvlddmkmDetailHeuristic(recordEnvelope);
      if (hint) message = hint;
    }

    const nvProviderLike =
      /nvlddmkm|amdkmdag/i.test(provider || "") ||
      nvKernelBinarySignalsNvlddmkmProvider(payload, recordEnvelope) ||
      evtxBlobContainsNvlddmkm(payload) ||
      (recordEnvelope?.length && evtxBlobContainsNvlddmkm(recordEnvelope));

    /**
     * BinXml often yields a wrong Event ID (wrong UInt16 token or template noise). Event Viewer shows the real ID from
     * metadata; our literal parse can surface values like {@code 912} while the UTF-16 message line clearly matches
     * {@code 153}/{@code 14}. Prefer the message when it matches known NVIDIA kernel wording.
     */
    const idFromMessage = inferNvlddmkmEventIdFromDriverDetail(message);
    if (nvProviderLike && idFromMessage != null && (eventId == null || eventId !== idFromMessage))
      eventId = idFromMessage;

    if (
      !/nvlddmkm|amdkmdag/i.test(provider || "") &&
      eventId != null &&
      (eventId === 14 || eventId === 153) &&
      /^system$/i.test(String(channel || "").trim())
    )
      provider = "nvlddmkm";

    if (!message && eventId != null && /nvlddmkm|amdkmdag/i.test(provider)) {
      message = `Event ${eventId} from this driver. Use “Copy” in Event Viewer or save as XML to see the same text the MMC shows.`;
    }

    if (eventId != null) confidence = "high";

    return { eventId, provider, channel, message, confidence };
  }

  /** Group events that share the same calendar second (UTC ISO) for burst dedupe. */
  function evtxIsoToSecondKey(iso) {
    const t = Date.parse(iso || "");
    if (Number.isNaN(t)) return "";
    return new Date(t).toISOString().slice(0, 19);
  }

  /**
   * Post-pass: optional same-second burst fill only (never “vote” Event IDs — that erased real {@code 14} rows).
   * Mutates {@code events} in place.
   * @param {{ eventId: number | null, provider: string, channel: string, timeIso: string, message: string, confidence: string }[]} events
   */
  function enrichEvtxParsedEvents(events) {
    if (!events.length) return;

    /** @type {Map<string, typeof events>} */
    const bySecond = new Map();
    for (const e of events) {
      const sec = evtxIsoToSecondKey(e.timeIso);
      const pk = `${sec}\x00${(e.provider || "").toLowerCase()}`;
      if (!bySecond.has(pk)) bySecond.set(pk, []);
      bySecond.get(pk).push(e);
    }
    for (const group of bySecond.values()) {
      if (group.length < 2) continue;
      const anchor = group.find((g) => g.eventId != null && String(g.message || "").trim().length >= 4);
      if (!anchor) continue;
      for (const e of group) {
        if (e === anchor) continue;
        if (!/nvlddmkm|amdkmdag/i.test(e.provider || "")) continue;
        if (e.eventId == null && anchor.eventId != null) {
          e.eventId = anchor.eventId;
          e.confidence = "low";
        }
        if (!String(e.message || "").trim() && String(anchor.message || "").trim()) {
          e.message = anchor.message;
          e.confidence = "low";
        }
      }
    }
  }

  /**
   * Count rows per provider + Event ID (full export, after enrichment).
   * @param {{ eventId: number | null, provider: string }[]} events
   */
  function countEvtxOccurrencesByProviderId(events) {
    /** @type {Map<string, number>} */
    const m = new Map();
    for (const e of events) {
      if (e.eventId == null) continue;
      const k = `${(e.provider || "").toLowerCase()}\x00${e.eventId}`;
      m.set(k, (m.get(k) || 0) + 1);
    }
    return m;
  }

  /** Compact summary line: nvlddmkm counts by Event ID (for the summary banner). */
  function buildNvlddmkmIdOccurrenceSummary(events) {
    /** @type {Record<number, number>} */
    const tally = {};
    for (const e of events) {
      if (!/nvlddmkm/i.test(e.provider || "") || e.eventId == null) continue;
      tally[e.eventId] = (tally[e.eventId] || 0) + 1;
    }
    const ids = Object.keys(tally).map(Number).sort((a, b) => (tally[b] || 0) - (tally[a] || 0));
    if (!ids.length) return "";
    const parts = ids.map((id) => `ID ${id}: ${tally[id]}×`);
    return `<p class="evtx-summary-breakdown"><strong>nvlddmkm</strong> in this file: ${parts.join("; ")}</p>`;
  }

  /** Magic at start of each EVTX record (same as python-evtx Record). Not {@code 0x2a2a2a2a}. */
  const EVTX_RECORD_MAGIC = 0x00002a2a;
  /** Standard EVTX chunk size (64 KiB). */
  const EVTX_CHUNK_BYTES = 0x10000;
  /** Event records begin at this offset within each chunk (after chunk header / tables). */
  const EVTX_CHUNK_RECORD_BASE = 0x200;

  /**
   * @param {Uint8Array} u8
   * @param {{ eventId: number | null, provider: string, channel: string, timeIso: string, message: string, confidence: string }[]} events
   * @param {number} off
   * @param {number} sz
   */
  function evtxTryPushRecord(u8, events, off, sz) {
    if (sz < 48 || sz > EVTX_CHUNK_BYTES || off + sz > u8.length) return;
    const tail = readU32le(u8, off + sz - 4);
    if (tail !== sz) return;
    const ft = readU64le(u8, off + 0x10);
    const payload = u8.subarray(off + 0x18, off + sz - 4);
    const recordEnvelope = u8.subarray(off, off + sz);
    let timeIso = extractSystemTimeCreatedIso(payload, recordEnvelope);
    if (!timeIso.trim()) timeIso = filetimeToIsoString(ft);
    const meta = extractWindowsEventFromBinPayload(payload, recordEnvelope);
    events.push({
      eventId: meta.eventId,
      provider: meta.provider,
      channel: meta.channel,
      timeIso,
      message: meta.message,
      confidence: meta.confidence,
    });
  }

  /**
   * Walk the record chain starting at {@code 0x200} like python-evtx; advance by {@code size} after each valid record.
   * @param {Uint8Array} u8
   * @param {number} chunkAbs Absolute file offset of chunk start
   * @param {{ eventId: number | null, provider: string, channel: string, timeIso: string, message: string, confidence: string }[]} events
   */
  function evtxParseRecordsInChunkStatic(u8, chunkAbs, events) {
    const chunkTail = chunkAbs + EVTX_CHUNK_BYTES;
    let off = chunkAbs + EVTX_CHUNK_RECORD_BASE;
    while (off + 48 <= chunkTail && off + 48 <= u8.length) {
      if (readU32le(u8, off) !== EVTX_RECORD_MAGIC) {
        off += 1;
        continue;
      }
      const sz = readU32le(u8, off + 4);
      if (sz < 48 || sz > EVTX_CHUNK_BYTES || off + sz > chunkTail || off + sz > u8.length) {
        off += 1;
        continue;
      }
      if (readU32le(u8, off + sz - 4) !== sz) {
        off += 1;
        continue;
      }
      evtxTryPushRecord(u8, events, off, sz);
      off += sz;
    }
  }

  /** @param {Uint8Array} u8 @returns {number | null} first chunk byte offset, or null if not ElfFile */
  function evtxResolveFirstChunkOffset(u8) {
    if (u8.length < 0x1000 || readAsciiFixed(u8, 0, 8) !== "ElfFile\x00") return null;
    /**
     * python-evtx places the first chunk at {@code header_chunk_size} (WORD {@code 0x28}), not the dword at {@code 0x20}
     * ({@code header_size}) — those often match ({@code 0x1000}) but differ on some builds.
     */
    let firstChunk = readU16le(u8, 0x28);
    if (
      !firstChunk ||
      firstChunk < 0x100 ||
      firstChunk >= u8.length ||
      firstChunk + EVTX_CHUNK_BYTES > u8.length
    )
      firstChunk = readU32le(u8, 0x20);
    if (
      !firstChunk ||
      firstChunk < 0x100 ||
      firstChunk >= u8.length ||
      firstChunk + EVTX_CHUNK_BYTES > u8.length
    )
      firstChunk = 0x1000;
    return firstChunk;
  }

  /**
   * @param {Uint8Array} u8
   * @param {number} abs0
   * @param {{ eventId: number | null, provider: string, channel: string, timeIso: string, message: string, confidence: string }[]} events
   */
  function evtxWalkChunksFromSync(u8, abs0, events) {
    const maxChunkIndex = Math.ceil(Math.max(0, u8.length - abs0) / EVTX_CHUNK_BYTES);
    for (let i = 0; i < maxChunkIndex; i++) {
      const chunkAbs = abs0 + i * EVTX_CHUNK_BYTES;
      if (chunkAbs + EVTX_CHUNK_BYTES > u8.length) break;
      if (readAsciiFixed(u8, chunkAbs, 8) !== "ElfChnk\x00") continue;
      evtxParseRecordsInChunkStatic(u8, chunkAbs, events);
    }
  }

  /**
   * @param {Uint8Array} u8
   * @param {{ eventId: number | null, provider: string, channel: string, timeIso: string, message: string, confidence: string }[]} events
   */
  function evtxLinearScanRecordsSync(u8, events) {
    let off = 0;
    while (off + 48 <= u8.length) {
      if (readU32le(u8, off) === EVTX_RECORD_MAGIC) {
        const sz = readU32le(u8, off + 4);
        if (sz >= 48 && sz <= EVTX_CHUNK_BYTES && off + sz <= u8.length) {
          const tail = readU32le(u8, off + sz - 4);
          if (tail === sz) {
            evtxTryPushRecord(u8, events, off, sz);
            off += sz;
            continue;
          }
        }
      }
      off++;
    }
  }

  /**
   * @param {Uint8Array} u8
   * @param {number} abs0
   * @param {{ eventId: number | null, provider: string, channel: string, timeIso: string, message: string, confidence: string }[]} events
   * @param {AbortSignal} signal
   * @param {(n: number) => void} onProgress 0..1 within {@code p0}..{@code p1}
   * @param {number} p0
   * @param {number} p1
   */
  async function evtxWalkChunksFromAsync(u8, abs0, events, signal, onProgress, p0, p1) {
    const maxChunkIndex = Math.ceil(Math.max(0, u8.length - abs0) / EVTX_CHUNK_BYTES);
    const yieldEvery = Math.max(1, Math.floor(maxChunkIndex / 120));
    for (let i = 0; i < maxChunkIndex; i++) {
      signal.throwIfAborted();
      const chunkAbs = abs0 + i * EVTX_CHUNK_BYTES;
      if (chunkAbs + EVTX_CHUNK_BYTES > u8.length) break;
      if (readAsciiFixed(u8, chunkAbs, 8) === "ElfChnk\x00") {
        evtxParseRecordsInChunkStatic(u8, chunkAbs, events);
      }
      if (i % yieldEvery === 0 || i === maxChunkIndex - 1) {
        onProgress(p0 + ((i + 1) / maxChunkIndex) * (p1 - p0));
        await yieldToMain();
      }
    }
  }

  /**
   * @param {Uint8Array} u8
   * @param {{ eventId: number | null, provider: string, channel: string, timeIso: string, message: string, confidence: string }[]} events
   * @param {AbortSignal} signal
   * @param {(n: number) => void} onProgress
   * @param {number} progressLo
   * @param {number} progressHi
   */
  async function evtxLinearScanRecordsAsync(u8, events, signal, onProgress, progressLo, progressHi) {
    const len = u8.length || 1;
    let off = 0;
    let steps = 0;
    const STRIDE = 14000;
    while (off + 48 <= u8.length) {
      signal.throwIfAborted();
      if (readU32le(u8, off) === EVTX_RECORD_MAGIC) {
        const sz = readU32le(u8, off + 4);
        if (sz >= 48 && sz <= EVTX_CHUNK_BYTES && off + sz <= u8.length) {
          const tail = readU32le(u8, off + sz - 4);
          if (tail === sz) {
            evtxTryPushRecord(u8, events, off, sz);
            off += sz;
            steps++;
            if (steps % STRIDE === 0) {
              onProgress(progressLo + (off / len) * (progressHi - progressLo));
              await yieldToMain();
            }
            continue;
          }
        }
      }
      off++;
      steps++;
      if (steps % STRIDE === 0) {
        onProgress(progressLo + (off / len) * (progressHi - progressLo));
        await yieldToMain();
      }
    }
  }

  /**
   * Parse binary Windows Event Log (.evtx): {@code ElfFile} header, {@code ElfChnk} chunks,
   * records with signature {@link EVTX_RECORD_MAGIC}. Falls back to a linear scan only if
   * structured parsing yields no rows (damaged or unusual exports).
   * @param {ArrayBuffer | Uint8Array} buffer
   */
  function parseEvtxBinaryRecords(buffer) {
    const u8 = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
    /** @type {{ eventId: number | null, provider: string, channel: string, timeIso: string, message: string, confidence: string }[]} */
    const events = [];
    const firstChunk = evtxResolveFirstChunkOffset(u8);
    if (firstChunk != null) {
      evtxWalkChunksFromSync(u8, firstChunk, events);
      /** Rare exports: first chunk offset matches {@code header_size} dword (0x20) instead of {@code header_chunk_size}. */
      if (events.length === 0) {
        const alt = readU32le(u8, 0x20);
        if (
          alt >= EVTX_CHUNK_RECORD_BASE &&
          alt + EVTX_CHUNK_BYTES <= u8.length &&
          alt !== firstChunk
        ) {
          evtxWalkChunksFromSync(u8, alt, events);
        }
      }
    }
    if (events.length === 0) {
      evtxLinearScanRecordsSync(u8, events);
    }
    return events;
  }

  /**
   * Same decode as {@link parseEvtxBinaryRecords} with periodic yields for UI progress / {@link AbortSignal}.
   * @param {ArrayBuffer | Uint8Array} buffer
   * @param {AbortSignal} signal
   * @param {(fraction: number) => void} onProgress
   */
  async function parseEvtxBinaryRecordsAsync(buffer, signal, onProgress) {
    const u8 = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
    /** @type {{ eventId: number | null, provider: string, channel: string, timeIso: string, message: string, confidence: string }[]} */
    const events = [];
    onProgress(0.02);
    await yieldToMain();
    const firstChunk = evtxResolveFirstChunkOffset(u8);
    if (firstChunk != null) {
      await evtxWalkChunksFromAsync(u8, firstChunk, events, signal, onProgress, 0.06, 0.88);
      if (events.length === 0) {
        const alt = readU32le(u8, 0x20);
        if (
          alt >= EVTX_CHUNK_RECORD_BASE &&
          alt + EVTX_CHUNK_BYTES <= u8.length &&
          alt !== firstChunk
        ) {
          await evtxWalkChunksFromAsync(u8, alt, events, signal, onProgress, 0.88, 0.93);
        }
      }
    }
    if (events.length === 0) {
      await evtxLinearScanRecordsAsync(u8, events, signal, onProgress, 0.1, 0.97);
    }
    onProgress(1);
    return events;
  }

  /** @param {string} name */
  function isLikelyEvtxXmlName(name) {
    const n = String(name || "").toLowerCase();
    return n.endsWith(".xml") || n.endsWith(".evtx.xml");
  }

  /**
   * @param {{ eventId: number | null, provider: string, channel: string, timeIso: string, message: string, confidence: string }[]} events
   */
  function filterWatchedEvtxEvents(events) {
    return events.filter((e) => e.eventId != null && EVTX_WATCHED_IDS.has(e.eventId));
  }

  /**
   * @param {{ eventId: number | null, provider: string, channel: string, timeIso: string, message: string, confidence: string }[]} events
   */
  function countWatchedById(events) {
    /** @type {Record<number, number>} */
    const counts = {};
    for (const e of events) {
      if (e.eventId == null || !EVTX_WATCHED_IDS.has(e.eventId)) continue;
      counts[e.eventId] = (counts[e.eventId] || 0) + 1;
    }
    return counts;
  }

  /** @param {string} iso */
  function formatEvtxDisplayTime(iso) {
    if (!iso || !iso.trim()) return "—";
    const t = Date.parse(iso);
    if (!Number.isNaN(t)) {
      try {
        const d = new Date(t);
        return d.toLocaleString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });
      } catch {
        /* fall through */
      }
    }
    return iso.trim();
  }

  /**
   * Short PSU vs GPU vs “other hardware” hints from decoded rows (education only; not medical or warranty advice).
   * @param {{ eventId: number | null, provider: string, channel: string, timeIso: string, message: string, confidence: string }[]} all
   */
  function buildEvtxStabilityTriage(all) {
    if (!all.length) return "";
    const counts = countWatchedById(all);
    let nvHint = 0;
    for (const e of all) {
      if (/nvlddmkm|amdkmdag/i.test(e.provider || "") || /nvlddmkm|amdkmdag/i.test(e.message || "")) nvHint++;
    }
    const hasNvId = Boolean(
      counts[13] ||
        counts[14] ||
        counts[153] ||
        counts[193] ||
        counts[4101] ||
        counts[10110] ||
        counts[10111]
    );
    const hasNv = nvHint > 0 || hasNvId;
    const hasKernelPower = Boolean(counts[41] || counts[63]);
    const hasWhea = Boolean(counts[17] || counts[18] || counts[19] || counts[20]);
    const has6008 = Boolean(counts[6008]);

    /** @type {string[]} */
    const paras = [];
    paras.push(
      `<p class="evtx-triage__lead"><strong>Stability triage</strong> (heuristic only; not a diagnosis). Patterns help separate <strong>power delivery / PSU / unclean shutdown</strong> from <strong>GPU driver &amp; card issues</strong>; confirm with OEM specs, cables, and stress tests.</p>`
    );

    if (hasKernelPower && has6008) {
      paras.push(
        `<p><strong>Kernel-Power (41 / 63) + EventLog 6008</strong>: Often the same <strong>unexpected shutdown</strong> episode (timestamp correlation). Points to power loss, PSU trip, hard reset, or crash. Use surrounding GPU / WHEA entries to narrow cause.</p>`
      );
    }

    if (hasNv && hasKernelPower) {
      paras.push(
        `<p><strong>Mixed display-driver errors + Kernel-Power (41 / 63)</strong>: Often <strong>transient power</strong> (GPU spikes, PSU shutdown, connector loss) or reset during heavy load. Check PSU headroom on 12V GPU rails, PCIe power seating, wall power, and thermal limits; pair with a clean graphics driver install.</p>`
      );
    } else if (hasNv && !hasKernelPower) {
      paras.push(
        `<p><strong>Display driver stack (nvlddmkm / amdkmdag / Display)</strong>: Points to <strong>driver, GPU, VRAM, thermals, or power to the card</strong>. Prefer vendor driver reinstall, monitor GPU temps, verify all PCIe power connectors, and rule out insufficient PSU for the GPU class.</p>`
      );
    } else if (!hasNv && hasKernelPower) {
      paras.push(
        `<p><strong>Kernel-Power (41 / 63) without nvlddmkm/amdkmdag in this decode</strong>: Typical of <strong>unexpected shutdown</strong>: PSU fault, overload, mains dip, sleep bugs, or non-GPU crashes. Less specific to “GPU vs PSU”, but <strong>undersized or failing PSU</strong> is a frequent cause under load.</p>`
      );
    }

    if (hasWhea && hasNv) {
      paras.push(
        `<p><strong>WHEA + display stack in the same export</strong>: Hardware error reporting alongside GPU/TDR entries. Worth checking <strong>PCIe slot and power connectors</strong>, thermals, and BIOS/chipset updates; use WHEA XML fields to see which component path Windows attributed.</p>`
      );
    } else if (hasWhea && !hasNv) {
      paras.push(
        `<p><strong>WHEA-Logger (17 / 18 / 19 / 20)</strong>: Hardware error paths; often <strong>PCIe, GPU, RAM, or CPU package</strong> depending on event details. Reseat GPU and RAM, update BIOS/chipset from the OEM, and review the full message fields in XML.</p>`
      );
    }

    if (!hasNv && !hasKernelPower && !hasWhea && !has6008 && all.length > 0) {
      paras.push(
        `<p>No decoded rows matched the key IDs above. Export <strong>XML</strong> from Event Viewer for full message text, or verify the log contains Application/System provider entries.</p>`
      );
    }

    return `<div class="evtx-triage">${paras.join("")}</div>`;
  }

  /**
   * Rows for the Event Viewer table: tracked Event IDs or anything tied to nvlddmkm when an ID could not be decoded.
   * Drop {@code nvlddmkm}/{@code amdkmdag} shells with **no** Event ID and **no** message. Those are usually stray UTF-16
   * matches in unrelated records (they appear as “extra” blank rows vs Event Viewer).
   * @param {{ eventId: number | null, provider: string, channel: string, timeIso: string, message: string, confidence: string }[]} events
   */
  function filterEvtxTableEvents(events) {
    return events.filter((e) => {
      if (e.eventId != null && EVTX_WATCHED_IDS.has(e.eventId)) return true;
      if (/nvlddmkm|amdkmdag/i.test(e.provider || "")) {
        const hasBody = e.eventId != null || String(e.message || "").trim().length > 0;
        return hasBody;
      }
      return false;
    });
  }

  /**
   * One short, non-jargony line for typical NVIDIA kernel messages (rendered under the technical text).
   * @param {string} message
   * @param {number | null} eventId
   */
  function nvKernelMessagePlainHint(message, eventId) {
    const m = String(message || "");

    if (/GPU recovery action changed/i.test(m) || eventId === 14) {
      return `<div class="evtx-msg-hint">${esc(
        "Windows changed how strongly it resets the graphics card after a freeze. You did not change this yourself.",
      )}</div>`;
    }

    const hasGpuId = /GPUID/i.test(m);
    const hasTdr =
      /\bTDR\b|Restarting TDR|Reset TDR|Resetting TDR|GpuRcReset|Error occurred on GPUID/i.test(m) || eventId === 153;

    if (!hasGpuId && !hasTdr) return "";

    let line = "";
    if (hasTdr && hasGpuId)
      line =
        "Your graphics card was too slow finishing a frame, so Windows reset the driver. GPUID is a code the driver prints for its own logs. It is not “GPU 0” or “GPU 1” in Task Manager.";
    else if (hasTdr)
      line =
        "The graphics card fell behind while drawing the screen and Windows tried to recover. If this repeats, update drivers, recheck power cables to the card, and watch heat and PSU size.";
    else line = "GPUID is only a code in the log. You can ignore it when reading this at home.";

    return `<div class="evtx-msg-hint">${esc(line)}</div>`;
  }

  /** @param {string} full @param {string} title */
  function extractDxDiagSection(full, title) {
    const escRe = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(
      "^\\s*-{10,}\\s*\\r?\\n\\s*" +
        escRe +
        "\\s*\\r?\\n\\s*-{10,}\\s*\\r?\\n([\\s\\S]*?)(?=^\\s*-{10,}\\s*$)",
      "im",
    );
    const m = full.match(re);
    return m ? m[1].trim() : "";
  }

  /** @param {string} body */
  function parseDxDiagKeyValueBlock(body) {
    /** @type {Record<string, string>} */
    const o = {};
    if (!body) return o;
    for (const line of body.split(/\r?\n/)) {
      const m = line.match(/^\s{2,}([^:[\]]+):\s*(.*)$/);
      if (m) {
        const k = m[1].trim();
        const v = m[2].trim();
        if (k && v) o[k] = v;
      }
    }
    return o;
  }

  /** @param {string} text */
  function looksLikeDxDiagExport(text) {
    const head = text.slice(0, 14000).toLowerCase();
    if (!/dxdiag|directx diagnostic/i.test(head)) return false;
    return (
      /system information/i.test(head) ||
      /display devices/i.test(head) ||
      /time of this report/i.test(head)
    );
  }

  /**
   * @param {string} fullText
   * @returns {{
   *   ok: boolean,
   *   system: Record<string, string>,
   *   displays: Record<string, string>[],
   *   sounds: Record<string, string>[],
   * }}
   */
  function parseDxDiagText(fullText) {
    const text = String(fullText ?? "").replace(/^\uFEFF/, "");
    const systemBody = extractDxDiagSection(text, "System Information");
    const system = systemBody
      ? parseDxDiagKeyValueBlock(systemBody)
      : parseDxDiagKeyValueBlock(text.slice(0, 12000));

    const displayBody = extractDxDiagSection(text, "Display Devices");
    /** @type {Record<string, string>[]} */
    const displays = [];
    if (displayBody) {
      const parts = displayBody
        .split(/\n(?=\s*Card name\s*:)/i)
        .map((p) => p.trim())
        .filter(Boolean);
      for (const p of parts) {
        const fields = parseDxDiagKeyValueBlock(p);
        if (Object.keys(fields).length) displays.push(fields);
      }
    }

    const soundBody = extractDxDiagSection(text, "Sound Devices");
    /** @type {Record<string, string>[]} */
    const sounds = [];
    if (soundBody) {
      const parts = soundBody
        .split(/\n(?=\s*Description\s*:)/i)
        .map((p) => p.trim())
        .filter(Boolean);
      for (const p of parts) {
        const f = parseDxDiagKeyValueBlock(p);
        if (Object.keys(f).length) sounds.push(f);
      }
      if (!sounds.length) {
        const one = parseDxDiagKeyValueBlock(soundBody);
        if (Object.keys(one).length) sounds.push(one);
      }
    }

    const ok = looksLikeDxDiagExport(text) && (Object.keys(system).length > 0 || displays.length > 0);
    return { ok, system, displays, sounds };
  }

  /**
   * @param {{ ok: boolean, system: Record<string, string>, displays: Record<string, string>[], sounds: Record<string, string>[] }} parsed
   * @param {string} fileName
   */
  function renderDxDiagSummaryHtml(parsed, fileName) {
    const { ok, system, displays, sounds } = parsed;
    if (!ok) {
      return `<p class="insight-disclaimer"><strong>${esc(
        fileName,
      )}</strong> does not look like a DxDiag text export. Run <code>dxdiag</code>, then use <strong>Save All Information…</strong> and load the resulting <code>.txt</code> here.</p>`;
    }

    const sysEntries = Object.entries(system).sort((a, b) => a[0].localeCompare(b[0])).slice(0, 32);
    const sysDl = sysEntries.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("");

    const displayHtml = displays
      .map((d, i) => {
        const title = d["Card name"] || `Display ${i + 1}`;
        const pairs = Object.entries(d).slice(0, 22);
        const dl = pairs.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("");
        return `<article class="dxdiag-card"><h3>${esc(title)}</h3><dl class="dxdiag-dl">${dl}</dl></article>`;
      })
      .join("");

    const soundHtml = sounds
      .map((s, i) => {
        const title = s["Description"] || s["Name"] || `Sound ${i + 1}`;
        const pairs = Object.entries(s).slice(0, 14);
        const dl = pairs.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("");
        return `<article class="dxdiag-card"><h3>${esc(title)}</h3><dl class="dxdiag-dl">${dl}</dl></article>`;
      })
      .join("");

    return `<div class="dxdiag-summary-inner">
      <p class="insight-disclaimer">Parsed locally from <strong>${esc(fileName)}</strong>. Field names follow the DxDiag export; compare with the source block below if anything looks off.</p>
      <article class="dxdiag-card"><h3>System Information</h3><dl class="dxdiag-dl">${sysDl || "<dt>Note</dt><dd>No key:value rows found in the System Information section.</dd>"}</dl></article>
      ${displayHtml ? `<h3 class="evtx-section-title" style="margin-top:1rem">Display Devices (${displays.length})</h3>${displayHtml}` : "<p class=\"insight-disclaimer\">No Display Devices section detected.</p>"}
      ${soundHtml ? `<h3 class="evtx-section-title" style="margin-top:1rem">Sound Devices (${sounds.length})</h3>${soundHtml}` : ""}
    </div>`;
  }

  function setupDxDiagPanel(panel) {
    const dropzone = panel.querySelector(".dropzone--dxdiag");
    const input = panel.querySelector(".file-input--dxdiag");
    const toolbar = panel.querySelector(".dxdiag-toolbar");
    const metaEl = panel.querySelector(".dxdiag-file-meta");
    const btnClear = panel.querySelector(".btn-dxdiag-clear");
    const body = panel.querySelector(".dxdiag-body");
    const parseNoteEl = panel.querySelector(".dxdiag-parse-note");
    const summaryEl = panel.querySelector(".dxdiag-summary");
    const pre = panel.querySelector(".content--dxdiag");
    /** @type {ReturnType<typeof createLanguageAdderSnapshot> | null} */
    let lastLangAdder = null;

    // Language Adder for DxDiag tab.
    let btnLangAdder = null;
    if (toolbar) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn btn--ghost btn-lang-adder";
      b.textContent = "Language Adder";
      b.title = "Export unknown (untranslated) tokens to extend offline language support";
      b.disabled = true;
      b.addEventListener("click", () => {
        if (!lastLangAdder) {
          window.alert("Load and analyze a DxDiag export first.");
          return;
        }
        const base = languageAdderExportBasename(lastLangAdder, "DxDiag");
        downloadTextAsFile(`${base}.language-adder.txt`, buildLanguageAdderTxtFromSnapshot(lastLangAdder), "text/plain;charset=utf-8");
      });
      toolbar.appendChild(b);
      btnLangAdder = b;
    }

    function clearAll() {
      if (toolbar) toolbar.hidden = true;
      if (body) body.hidden = true;
      if (metaEl) metaEl.textContent = "";
      if (parseNoteEl) parseNoteEl.textContent = "";
      if (summaryEl) summaryEl.innerHTML = "";
      if (pre) pre.textContent = "";
      if (input) input.value = "";
      lastLangAdder = null;
      if (btnLangAdder) btnLangAdder.disabled = true;
    }

    function loadFile(file) {
      const reader = new FileReader();
      reader.onerror = () => {
        if (parseNoteEl) parseNoteEl.textContent = "Could not read this file in the browser.";
        if (toolbar) toolbar.hidden = false;
        if (body) body.hidden = false;
      };
      reader.onload = () => {
        const buf = reader.result;
        if (!(buf instanceof ArrayBuffer)) return;
        const name = file.name || "DxDiag.txt";
        const { text, label } = decodeBuffer(buf, "gpu", "auto");
        const parsed = parseDxDiagText(text);
        if (pre) pre.textContent = text;
        if (summaryEl) summaryEl.innerHTML = renderDxDiagSummaryHtml(parsed, name);
        try {
          const toks = [];
          // Include parsed keys and common section labels.
          for (const [k, v] of Object.entries(parsed?.system || {})) {
            toks.push(k, v);
          }
          for (const d of parsed?.displays || []) {
            for (const [k, v] of Object.entries(d)) toks.push(k, v);
          }
          for (const s of parsed?.sounds || []) {
            for (const [k, v] of Object.entries(s)) toks.push(k, v);
          }
          // Include some raw lines too (localized headings).
          toks.push(...String(text).split(/[\r\n]+/g).slice(0, 1200));
          lastLangAdder = createLanguageAdderSnapshot({
            fileName: name,
            encodingLabel: label,
            source: "dxdiag",
            tokens: toks,
          });
          if (btnLangAdder) btnLangAdder.disabled = Object.keys(lastLangAdder.unknownTokens || {}).length === 0;
        } catch {
          lastLangAdder = null;
          if (btnLangAdder) btnLangAdder.disabled = true;
        }
        if (parseNoteEl) parseNoteEl.textContent = "";
        if (metaEl) metaEl.textContent = `${name} · ${(buf.byteLength / 1024).toFixed(1)} KiB · ${label}`;
        if (toolbar) toolbar.hidden = false;
        if (body) body.hidden = false;
        dropzone.style.display = "none";
      };
      reader.readAsArrayBuffer(file);
    }

    function preventDefaults(e) {
      e.preventDefault();
      e.stopPropagation();
    }
    ["dragenter", "dragover", "dragleave", "drop"].forEach((ev) => {
      dropzone?.addEventListener(ev, preventDefaults);
    });
    dropzone?.addEventListener("dragenter", () => dropzone.classList.add("is-dragover"));
    dropzone?.addEventListener("dragleave", () => dropzone.classList.remove("is-dragover"));
    dropzone?.addEventListener("dragover", () => dropzone.classList.add("is-dragover"));
    dropzone?.addEventListener("drop", (e) => {
      dropzone.classList.remove("is-dragover");
      const f = e.dataTransfer?.files?.[0];
      if (f) loadFile(f);
    });
    input?.addEventListener("change", () => {
      const f = input.files?.[0];
      if (f) loadFile(f);
      if (input) input.value = "";
    });
    dropzone?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        input?.click();
      }
    });
    btnClear?.addEventListener("click", () => {
      clearAll();
      dropzone.style.display = "";
    });
  }

  function setupEvtxPanel(panel) {
    const dropzone = panel.querySelector(".dropzone--evtx");
    const input = panel.querySelector(".file-input--evtx");
    const toolbar = panel.querySelector(".evtx-toolbar");
    const metaEl = panel.querySelector(".evtx-file-meta");
    const btnClear = panel.querySelector(".btn-evtx-clear");
    const body = panel.querySelector(".evtx-body");
    const parseNoteEl = panel.querySelector(".evtx-parse-note");
    const summaryEl = panel.querySelector(".evtx-summary");
    const cardsEl = panel.querySelector(".evtx-watch-cards");
    const tbody = panel.querySelector(".evtx-table-body");
    /** @type {ReturnType<typeof createLanguageAdderSnapshot> | null} */
    let lastLangAdder = null;

    // Language Adder for Event Viewer tab (localized message text / provider names).
    let btnLangAdder = null;
    if (toolbar) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn btn--ghost btn-lang-adder";
      b.textContent = "Language Adder";
      b.title = "Export unknown (untranslated) tokens to extend offline language support";
      b.disabled = true;
      b.addEventListener("click", () => {
        if (!lastLangAdder) {
          window.alert("Load and analyze an Event Viewer export first.");
          return;
        }
        const base = languageAdderExportBasename(lastLangAdder, "EventViewer");
        downloadTextAsFile(`${base}.language-adder.txt`, buildLanguageAdderTxtFromSnapshot(lastLangAdder), "text/plain;charset=utf-8");
      });
      toolbar.appendChild(b);
      btnLangAdder = b;
    }

    const refreshLanguageAdder = (fileName, encodingLabel, events) => {
      try {
        const toks = [];

        const isTechnicalJargonish = (s) => {
          const t = String(s || "").trim();
          if (!t) return true;
          // Known driver/module tokens and file types.
          if (/\b(?:nvlddmkm|amdkmdag|dxgkrnl|dxgmms2|watchdog|wdf)\b/i.test(t)) return true;
          if (/\b[a-z0-9_.-]+\.(?:sys|dll|exe|efi|inf|cat|mui|log|cab|dat)\b/i.test(t)) return true;
          // GUIDs, hashes, and IDs.
          if (/\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/i.test(t)) return true;
          if (/\b0x[a-f0-9]{4,}\b/i.test(t)) return true;
          if (/\b[a-f0-9]{16,}\b/i.test(t)) return true;
          // Paths / registry / URLs.
          if (/[A-Za-z]:\\|\\\\|\/System32\/|HKEY_|https?:\/\//i.test(t)) return true;
          // "Event ID 4101" / pure numeric IDs.
          if (/\b(?:event\s*id|id)\s*[:#]?\s*\d+\b/i.test(t)) return true;
          if (/^\d{1,6}$/.test(t)) return true;
          return false;
        };

        const extractHumanSegments = (msg) => {
          const out = [];
          const raw = String(msg || "");
          if (!raw) return out;
          // Split into sentence-ish chunks and keep the ones that contain non-ASCII letters (likely localized language),
          // while dropping chunks dominated by technical ids/paths.
          const parts = raw
            .split(/[\r\n]+/g)
            .flatMap((ln) => ln.split(/[.;:!?•·]+/g))
            .map((x) => x.trim())
            .filter(Boolean);
          for (const p of parts) {
            if (p.length < 2) continue;
            if (!/[^\x00-\x7F]/.test(p)) continue; // keep only clearly non-English chunks
            if (isTechnicalJargonish(p)) continue;
            // Also drop chunks that contain obvious driver/module tokens even if the chunk is otherwise localized.
            if (/\b[a-z0-9_.-]+\.(?:sys|dll|exe)\b/i.test(p)) continue;
            if (/\b(?:nvlddmkm|amdkmdag)\b/i.test(p)) continue;
            out.push(p.slice(0, 180));
          }
          return out;
        };

        for (const e of Array.isArray(events) ? events : []) {
          // Provider/channel names are usually English/ASCII; still include them in case they are localized.
          toks.push(e?.provider, e?.channel, e?.level, e?.task);
          // Messages can contain technical identifiers; only export human-language chunks.
          toks.push(...extractHumanSegments(e?.message));
        }
        lastLangAdder = createLanguageAdderSnapshot({
          fileName: String(fileName || "event-log"),
          encodingLabel: String(encodingLabel || "auto"),
          source: "evtx",
          tokens: toks.filter(Boolean),
        });
        if (btnLangAdder) btnLangAdder.disabled = Object.keys(lastLangAdder.unknownTokens || {}).length === 0;
      } catch {
        lastLangAdder = null;
        if (btnLangAdder) btnLangAdder.disabled = true;
      }
    };
    const loadJobEl = panel.querySelector(".panel-load-job--evtx");
    const loadProgress = panel.querySelector(".evtx-panel-load__progress");
    const loadLabel = panel.querySelector(".evtx-panel-load__label");
    const loadStatusRow = panel.querySelector(".evtx-panel-load__status");
    /** @type {AbortController | null} */
    let evtxLoadAbort = null;
    /** "read" while file bytes load; spinner + "Analyzing…" only after buffer is ready. */
    let evtxLoadJobPhase = "read";

    function clearAll() {
      evtxLoadAbort?.abort();
      evtxHubSnapshot = null;
      dispatchEvtxHubUpdated();
      if (loadJobEl) {
        loadJobEl.hidden = true;
        loadJobEl.classList.remove("panel-load-job--phase-read");
      }
      if (toolbar) toolbar.hidden = true;
      if (body) body.hidden = true;
      if (metaEl) metaEl.textContent = "";
      if (parseNoteEl) parseNoteEl.textContent = "";
      if (summaryEl) summaryEl.innerHTML = "";
      if (cardsEl) cardsEl.innerHTML = "";
      if (tbody) tbody.innerHTML = "";
      if (input) input.value = "";
    }

    /** @param {ReturnType<typeof parseWindowsEventXmlExport>} all */
    function renderEvtxResults(name, all, parseNote, source) {
      if (!summaryEl || !cardsEl || !tbody || !parseNoteEl) return;
      enrichEvtxParsedEvents(all);
      const watched = filterWatchedEvtxEvents(all);
      const tableEvents = filterEvtxTableEvents(all);
      const counts = countWatchedById(all);
      const occMap = countEvtxOccurrencesByProviderId(all);
      const totalScanned = all.length;
      parseNoteEl.textContent = parseNote || "";
      const medium = all.filter((e) => e.confidence === "low").length;

      const evtxBinaryNote =
        source === "evtx"
          ? `<p class="evtx-summary-tip">Binary <code>.evtx</code> often does not store the provider label Event Viewer displays (Windows resolves it live). This tab treats NVIDIA kernel UTF-16 strings (<code>GPUID</code>, TDR, recovery, …) as <strong>nvlddmkm</strong>. If Event Viewer shows more rows than this export, use <strong>Save All Events As…</strong> for the full log, or save the <strong>filtered</strong> log: the file on disk must contain those rows.</p>`
          : "";

      summaryEl.innerHTML = `<div class="evtx-summary-inner">
        <p><strong>${esc(name)}</strong> · source: <strong>${esc(source)}</strong> · records scanned: <strong>${totalScanned}</strong>
        · matching key Event IDs: <strong>${watched.length}</strong>
        · events shown in table: <strong>${tableEvents.length}</strong>${medium ? ` · <span class="evtx-summary-tip">rows marked low confidence may differ slightly from Event Viewer. Use <strong>Save All Events As… → XML</strong> for identical wording</span>` : ""}</p>
        ${evtxBinaryNote}
        ${buildNvlddmkmIdOccurrenceSummary(all)}
        ${buildEvtxStabilityTriage(all)}
      </div>`;

      /** @type {string[]} */
      const cardParts = [];
      for (const blurb of EVTX_KEY_EVENT_BLURBS) {
        let n = 0;
        if (!blurb.referenceOnly) for (const id of blurb.ids) n += counts[id] || 0;
        const badge = blurb.referenceOnly
          ? `<span class="evtx-card__count evtx-card__count--ref">Reference</span>`
          : n > 0
            ? `<span class="evtx-card__count">${n} in file</span>`
            : `<span class="evtx-card__count evtx-card__count--none">Not seen</span>`;
        cardParts.push(`<article class="evtx-card">
          <header class="evtx-card__head"><h4 class="evtx-card__title">${esc(blurb.title)}</h4>${badge}</header>
          <p class="evtx-card__body">${esc(blurb.body)}</p>
        </article>`);
      }
      cardsEl.innerHTML = cardParts.join("");

      const sorted = tableEvents.slice().sort((a, b) => {
        const ta = Date.parse(a.timeIso || "") || 0;
        const tb = Date.parse(b.timeIso || "") || 0;
        return tb - ta;
      });
      const rows = sorted.map((e) => {
        const msgLimit = 420;
        const msg = e.message
          ? esc(e.message.slice(0, msgLimit)) + (e.message.length > msgLimit ? "…" : "")
          : "—";
        const hint =
          /nvlddmkm|amdkmdag/i.test(e.provider || "") ? nvKernelMessagePlainHint(e.message || "", e.eventId) : "";
        const occKey = `${(e.provider || "").toLowerCase()}\x00${e.eventId}`;
        const occ =
          e.eventId != null ? esc(String(occMap.get(occKey) ?? 1)) : "—";
        return `<tr>
          <td>${esc(formatEvtxDisplayTime(e.timeIso))}</td>
          <td>${e.eventId != null ? esc(String(e.eventId)) : "—"}</td>
          <td class="evtx-col-count" title="How many rows in this file share this provider + Event ID">${occ}</td>
          <td>${esc(e.provider || "—")}</td>
          <td>${esc(e.channel || "—")}</td>
          <td class="evtx-msg-cell">${msg}${hint}</td>
        </tr>`;
      });
      tbody.innerHTML =
        rows.length > 0
          ? rows.join("")
          : `<tr><td colspan="6" class="evtx-empty-row">No matching rows in this decode. Drop the same <code>.evtx</code> you open in Event Viewer, or use <strong>Save All Events As… → XML</strong> for a text-perfect match.</td></tr>`;

      try {
        evtxHubSnapshot = { name, events: all, source };
      } catch {
        evtxHubSnapshot = null;
      }
      dispatchEvtxHubUpdated();

      if (toolbar) toolbar.hidden = false;
      if (body) body.hidden = false;
    }

    async function loadFile(file) {
      const wantProgress =
        file.size >= LARGE_FILE_PROGRESS_THRESHOLD ||
        /\.evtx$/i.test(file.name) ||
        /\.xml$/i.test(file.name);
      let pauseForDoneUi = false;
      evtxLoadAbort?.abort();
      evtxLoadAbort = new AbortController();
      const signal = evtxLoadAbort.signal;

      const showJob = () => {
        if (loadJobEl && wantProgress) {
          evtxLoadJobPhase = "read";
          loadJobEl.classList.add("panel-load-job--phase-read");
          loadJobEl.hidden = false;
          if (loadProgress) {
            loadProgress.value = 0;
            loadProgress.max = 100;
          }
          if (loadStatusRow) loadStatusRow.classList.remove("panel-load-job__status--done");
          if (loadLabel) loadLabel.textContent = "Loading file…";
        }
      };
      const hideJob = () => {
        if (loadJobEl) {
          loadJobEl.hidden = true;
          loadJobEl.classList.remove("panel-load-job--phase-read");
        }
      };
      const setP = (/** @type {number} */ frac, /** @type {string} */ _msg) => {
        if (loadProgress) loadProgress.value = Math.round(frac * 100);
        const done = frac >= 1;
        if (loadStatusRow) loadStatusRow.classList.toggle("panel-load-job__status--done", done);
        if (loadLabel) {
          if (done) loadLabel.textContent = "Completed";
          else if (evtxLoadJobPhase === "read") loadLabel.textContent = "Loading file…";
          else loadLabel.textContent = "Analyzing…";
        }
      };

      try {
        showJob();
        const buf = wantProgress
          ? await readFileAsArrayBufferWithProgress(file, signal, (frac) => setP(frac * 0.26, ""))
          : await file.arrayBuffer();
        signal.throwIfAborted();
        if (wantProgress) {
          evtxLoadJobPhase = "work";
          if (loadJobEl) loadJobEl.classList.remove("panel-load-job--phase-read");
          if (loadStatusRow) loadStatusRow.classList.remove("panel-load-job__status--done");
          if (loadLabel) loadLabel.textContent = "Analyzing…";
        }
        const name = file.name || "event-log";
        let parseNote = "";
        /** @type {ReturnType<typeof parseWindowsEventXmlExport>} */
        let events;

        if (isLikelyEvtxXmlName(name)) {
          setP(0.3, "");
          await yieldToMain();
          signal.throwIfAborted();
          const { text } = decodeBuffer(buf, "gpu", "auto");
          events =
            wantProgress && text.length > LARGE_FILE_PROGRESS_THRESHOLD
              ? await parseWindowsEventXmlExportAsync(text, signal, (f) => setP(0.3 + f * 0.7, ""))
              : parseWindowsEventXmlExport(text);
          if (!events.length)
            parseNote =
              "No <Event> blocks parsed. Confirm this is an Event Viewer XML export (not plain text).";
          renderEvtxResults(name, events, parseNote, "xml");
          refreshLanguageAdder(name, "XML", events);
          if (metaEl) metaEl.textContent = `${name} · XML`;
          setP(1, "");
          pauseForDoneUi = true;
          return;
        }

        const decodedProbe = decodeBuffer(buf, "gpu", "auto");
        const head = decodedProbe.text.slice(0, 600).trimStart();
        if (/^<\?xml/i.test(head) || /<Events\b/i.test(head) || /<Event\b/i.test(head)) {
          setP(0.3, "");
          await yieldToMain();
          signal.throwIfAborted();
          events =
            wantProgress && decodedProbe.text.length > LARGE_FILE_PROGRESS_THRESHOLD
              ? await parseWindowsEventXmlExportAsync(decodedProbe.text, signal, (f) => setP(0.3 + f * 0.7, ""))
              : parseWindowsEventXmlExport(decodedProbe.text);
          if (!events.length)
            parseNote =
              "XML-like head found but no <Event> blocks parsed; file may be truncated or not an Event Viewer export.";
          renderEvtxResults(name, events, parseNote, "xml");
          refreshLanguageAdder(name, "XML (detected)", events);
          if (metaEl) metaEl.textContent = `${name} · XML (detected)`;
          setP(1, "");
          pauseForDoneUi = true;
          return;
        }

        setP(0.28, "");
        await yieldToMain();
        signal.throwIfAborted();
        events =
          wantProgress && file.size > 64 * 1024
            ? await parseEvtxBinaryRecordsAsync(buf, signal, (f) => setP(0.28 + f * 0.72, ""))
            : parseEvtxBinaryRecords(buf);
        if (!events.length) {
          parseNote =
            "No EVTX records could be decoded from this binary. Open the log in Event Viewer and use Save All Events As… → XML, then load the .xml here.";
        } else {
          const missed = events.filter((e) => e.eventId == null).length;
          if (missed > 0 && events.length >= 16 && missed / events.length > 0.82)
            parseNote =
              "Some EVTX rows still lack a decoded Event ID (heavy template compression or damaged chunk). XML export may list every ID and message.";
        }
        renderEvtxResults(name, events, parseNote, "evtx");
        refreshLanguageAdder(name, "EVTX (binary)", events);
        if (metaEl) metaEl.textContent = `${name} · EVTX (binary)`;
        setP(1, "");
        pauseForDoneUi = true;
      } catch (e) {
        if (e && (/** @type {Error} */ (e).name === "AbortError" || /** @type {any} */ (e).code === 20)) {
          clearAll();
          if (body) body.hidden = false;
          if (toolbar) toolbar.hidden = false;
          if (parseNoteEl) parseNoteEl.textContent = "Load interrupted.";
        } else {
          console.error(e);
          if (parseNoteEl) {
            parseNoteEl.textContent =
              "Could not read or parse this file. Check permissions, or try an XML export from Event Viewer.";
          }
          if (toolbar) toolbar.hidden = false;
          if (body) body.hidden = false;
        }
      } finally {
        if (wantProgress && pauseForDoneUi) {
          setP(1, "");
          await new Promise((r) => setTimeout(r, 520));
        }
        hideJob();
      }
    }

    function preventDefaults(e) {
      e.preventDefault();
      e.stopPropagation();
    }
    ["dragenter", "dragover", "dragleave", "drop"].forEach((ev) => {
      dropzone?.addEventListener(ev, preventDefaults);
    });
    dropzone?.addEventListener("dragenter", () => dropzone.classList.add("is-dragover"));
    dropzone?.addEventListener("dragleave", () => dropzone.classList.remove("is-dragover"));
    dropzone?.addEventListener("dragover", () => dropzone.classList.add("is-dragover"));
    dropzone?.addEventListener("drop", (e) => {
      dropzone.classList.remove("is-dragover");
      const dt = e.dataTransfer;
      const f = dt?.files?.[0];
      if (f) void loadFile(f);
    });
    input?.addEventListener("change", () => {
      const f = input.files?.[0];
      if (f) void loadFile(f);
      input.value = "";
    });
    dropzone?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        input?.click();
      }
    });
    btnClear?.addEventListener("click", () => clearAll());
  }

  /**
   * Advanced-only merged GPU timeline: GPU‑Z sensor samples + GPU‑related Event Viewer rows.
   * @param {HTMLElement} panel
   */
  function setupGodsEyePanel(panel) {
    const statusEl = panel.querySelector("[data-godeye-status]");
    const wrapEl = panel.querySelector("[data-godeye-canvas-wrap]");
    const canvas = panel.querySelector("[data-godeye-canvas]");
    const legendEl = panel.querySelector("[data-godeye-legend]");
    const SERIES_COLORS = ["#76b900", "#22c55e", "#38bdf8", "#f97316", "#a855f7", "#eab308"];

    let raf = 0;

    function schedule() {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = 0;
        render();
      });
    }

    function setStatus(html) {
      if (statusEl) statusEl.innerHTML = html;
    }

    function isLightTheme() {
      return (document.documentElement.getAttribute("data-theme") || "dark") === "light";
    }

    function isGpuRelevantEvtxEvent(e) {
      const id = e?.eventId;
      if (id == null) return false;
      if (EVTX_WATCHED_IDS.has(id)) return true;
      const prov = String(e?.provider || "");
      const msg = String(e?.message || "");
      const hay = `${prov} ${msg}`.toLowerCase();
      if (/\b(nvlddmkm|amdkmdag|dxgkrnl|tdr|display driver|livekernelevent|xid)\b/i.test(hay)) return true;
      return false;
    }

    function metricPickScore(name) {
      const n = normalizeHeader(name);
      let s = 0;
      if (/gpu|graphics|nvidia|amd|geforce|radeon/i.test(n)) s += 6;
      if (/temp|°c|celsius/i.test(n)) s += 5;
      if (/hotspot/i.test(n)) s += 4;
      if (/power|watt|w\b/i.test(n)) s += 4;
      if (/clock|freq|mhz|ghz/i.test(n)) s += 3;
      if (/load|util|usage|busy/i.test(n)) s += 3;
      if (/fan|rpm/i.test(n)) s += 2;
      if (/volt|vcore/i.test(n)) s += 2;
      if (/pcie|bus/i.test(n)) s += 2;
      if (/mem|vram/i.test(n)) s += 2;
      return s;
    }

    /** @param {ReturnType<typeof parseSensorCsv> | null} parsed @param {number} max */
    function pickMetrics(parsed, max) {
      if (!parsed) return [];
      const cols = Array.isArray(parsed.numericCols) ? parsed.numericCols.slice() : [];
      cols.sort((a, b) => metricPickScore(b.name) - metricPickScore(a.name) || a.index - b.index);
      const out = [];
      for (const c of cols) {
        if (!c || c.index === 0) continue;
        out.push(c);
        if (out.length >= max) break;
      }
      return out;
    }

    function gpuTimeBoundsFromParsed(parsed) {
      if (!parsed) return { min: null, max: null };
      const tr = parsed.timeRange;
      if (tr && tr.startMs != null && tr.endMs != null && Number.isFinite(tr.startMs) && Number.isFinite(tr.endMs)) {
        return { min: tr.startMs, max: tr.endMs };
      }
      let min = Infinity;
      let max = -Infinity;
      for (const col of parsed.numericCols || []) {
        for (const p of col.pts || []) {
          const t = p.t;
          if (t == null || !Number.isFinite(t)) continue;
          if (t < min) min = t;
          if (t > max) max = t;
        }
      }
      if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: null, max: null };
      return { min, max };
    }

    function resizeCanvasToCssPixels() {
      if (!(canvas instanceof HTMLCanvasElement) || !wrapEl) return;
      const rect = wrapEl.getBoundingClientRect();
      const cssW = Math.max(320, Math.floor(rect.width || 1200));
      const cssH = 520;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      canvas.width = Math.floor(cssW * dpr);
      canvas.height = Math.floor(cssH * dpr);
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function draw() {
      if (!(canvas instanceof HTMLCanvasElement)) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const light = isLightTheme();
      const bg = light ? "#ffffff" : "rgba(10, 14, 12, 0.92)";
      const fg = light ? "#0f172a" : "rgba(230, 245, 235, 0.92)";
      const muted = light ? "#64748b" : "rgba(170, 200, 180, 0.55)";
      const grid = light ? "rgba(15, 23, 42, 0.08)" : "rgba(118, 185, 0, 0.12)";
      const eventColor = light ? "#c026d3" : "rgba(76, 222, 128, 0.95)";

      const cssW = canvas.clientWidth || 1200;
      const cssH = canvas.clientHeight || 520;
      ctx.clearRect(0, 0, cssW, cssH);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, cssW, cssH);

      const gpu = gpuHubSnapshot;
      const ev = evtxHubSnapshot;
      if (!isAdvancedModeOn()) {
        setStatus(
          "Turn on <strong>Advanced</strong> to enable GPU God&rsquo;s Eye. This merged timeline is intentionally hidden in the standard workflow."
        );
        if (wrapEl) wrapEl.hidden = true;
        if (legendEl) legendEl.hidden = true;
        return;
      }

      if (!gpu || !gpu.logs?.length || !gpu.logs.some((l) => l.parsed)) {
        setStatus("Load <strong>GPU‑Z</strong> sensor logs on the GPU‑Z tab first. This view needs parsed timestamps from column 0.");
        if (wrapEl) wrapEl.hidden = true;
        if (legendEl) legendEl.hidden = true;
        return;
      }
      if (!ev || !Array.isArray(ev.events) || !ev.events.length) {
        setStatus("Load an <strong>Event Viewer</strong> export on the Event Viewer tab first (<code>.evtx</code> or XML).");
        if (wrapEl) wrapEl.hidden = true;
        if (legendEl) legendEl.hidden = true;
        return;
      }

      /** @type {number[]} */
      const evTimes = [];
      for (const e of ev.events) {
        const t = Date.parse(e.timeIso || "");
        if (Number.isFinite(t)) evTimes.push(t);
      }
      if (!evTimes.length) {
        setStatus("Event Viewer rows did not include parseable timestamps (<code>SystemTime</code>). Try an XML export for richer time fields.");
        if (wrapEl) wrapEl.hidden = true;
        if (legendEl) legendEl.hidden = true;
        return;
      }
      evTimes.sort((a, b) => a - b);
      const evMin = evTimes[0];
      const evMax = evTimes[evTimes.length - 1];

      /** @type {{ min: number, max: number }[]} */
      const gpuBounds = [];
      for (const l of gpu.logs) {
        const b = gpuTimeBoundsFromParsed(l.parsed);
        if (b.min != null && b.max != null) gpuBounds.push({ min: b.min, max: b.max });
      }
      if (!gpuBounds.length) {
        setStatus("GPU‑Z logs are present, but timestamps could not be parsed from column 0. Re-export a sensor log that includes a time column.");
        if (wrapEl) wrapEl.hidden = true;
        if (legendEl) legendEl.hidden = true;
        return;
      }
      const gpuMin = Math.min(...gpuBounds.map((b) => b.min));
      const gpuMax = Math.max(...gpuBounds.map((b) => b.max));

      let t0 = Math.max(gpuMin, evMin);
      let t1 = Math.min(gpuMax, evMax);
      if (!(t1 > t0)) {
        // No overlap: still visualize the union window (less “merged”, but still useful offline).
        t0 = Math.min(gpuMin, evMin);
        t1 = Math.max(gpuMax, evMax);
        setStatus(
          `<strong>Note:</strong> GPU‑Z time range and Event Viewer timestamps do not overlap as parsed. Showing the combined window anyway (check timezone / wrong file / partial capture).`
        );
      } else {
        const g0 = new Date(gpuMin).toLocaleString();
        const g1 = new Date(gpuMax).toLocaleString();
        const e0 = new Date(evMin).toLocaleString();
        const e1 = new Date(evMax).toLocaleString();
        setStatus(`<strong>Merged window</strong> · GPU‑Z: <code>${g0}</code> → <code>${g1}</code> · Events: <code>${e0}</code> → <code>${e1}</code>`);
      }

      const span = Math.max(60_000, t1 - t0);
      const pad = span * 0.02;
      t0 -= pad;
      t1 += pad;

      const padL = 56;
      const padR = 18;
      const padT = 18;
      const padB = 70;
      const plotW = Math.max(40, cssW - padL - padR);
      const plotH = Math.max(40, cssH - padT - padB);

      const xOf = (/** @type {number} */ ms) => padL + ((ms - t0) / (t1 - t0)) * plotW;

      // Grid
      ctx.strokeStyle = grid;
      ctx.lineWidth = 1;
      for (let i = 0; i <= 6; i++) {
        const x = padL + (plotW * i) / 6;
        ctx.beginPath();
        ctx.moveTo(x, padT);
        ctx.lineTo(x, padT + plotH);
        ctx.stroke();
      }
      for (let i = 0; i <= 4; i++) {
        const y = padT + (plotH * i) / 4;
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(padL + plotW, y);
        ctx.stroke();
      }

      // X labels (3 ticks)
      ctx.fillStyle = muted;
      ctx.font = "12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
      for (let i = 0; i < 3; i++) {
        const ms = t0 + ((t1 - t0) * i) / 2;
        const label = (() => {
          try {
            return new Date(ms).toLocaleString(undefined, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
          } catch {
            return String(ms);
          }
        })();
        const x = xOf(ms);
        ctx.fillText(label, Math.min(padL + plotW - 120, Math.max(padL, x - 55)), padT + plotH + 26);
      }

      /** @type {{ label: string, color: string, minY: number, maxY: number, pts: { x: number, y: number }[] }[]} */
      const series = [];
      let si = 0;
      for (const log of gpu.logs) {
        const parsed = log.parsed;
        if (!parsed) continue;
        const picks = pickMetrics(parsed, 2);
        for (const col of picks) {
          const ptsRaw = (col.pts || [])
            .map((p) => ({ t: p.t, v: p.v }))
            .filter((p) => p.t != null && Number.isFinite(p.t) && Number.isFinite(p.v) && p.t >= t0 && p.t <= t1);
          if (ptsRaw.length < 2) continue;
          let minY = Infinity;
          let maxY = -Infinity;
          for (const p of ptsRaw) {
            if (p.v < minY) minY = p.v;
            if (p.v > maxY) maxY = p.v;
          }
          if (!Number.isFinite(minY) || !Number.isFinite(maxY) || minY === maxY) {
            minY -= 1;
            maxY += 1;
          }
          const pts = ptsRaw.map((p) => {
            const x = xOf(p.t);
            const yn = (p.v - minY) / (maxY - minY);
            const y = padT + plotH - yn * plotH;
            return { x, y };
          });
          const color = SERIES_COLORS[si % SERIES_COLORS.length];
          si++;
          series.push({
            label: `${log.name}: ${col.name}`,
            color,
            minY,
            maxY,
            pts,
          });
        }
      }

      if (!series.length) {
        setStatus("GPU‑Z data is loaded, but no numeric samples fell inside the merged time window. Try a longer capture or confirm the time column parses.");
        if (wrapEl) wrapEl.hidden = true;
        if (legendEl) legendEl.hidden = true;
        return;
      }

      // Draw series
      for (const s of series) {
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < s.pts.length; i++) {
          const p = s.pts[i];
          if (!p) continue;
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }

      // Events
      const evPts = [];
      for (const e of ev.events) {
        if (!isGpuRelevantEvtxEvent(e)) continue;
        const ms = Date.parse(e.timeIso || "");
        if (!Number.isFinite(ms) || ms < t0 || ms > t1) continue;
        evPts.push({ ms, e });
      }
      evPts.sort((a, b) => a.ms - b.ms);

      ctx.strokeStyle = eventColor;
      ctx.lineWidth = 1.25;
      for (const p of evPts) {
        const x = xOf(p.ms);
        ctx.beginPath();
        ctx.moveTo(x, padT);
        ctx.lineTo(x, padT + plotH);
        ctx.stroke();
      }

      // Title + counts
      ctx.fillStyle = fg;
      ctx.font = "600 13px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
      ctx.fillText(`GPU God's Eye · ${evPts.length} GPU-related markers · ${series.length} sensor series`, padL, 16);

      // Legend
      if (legendEl) {
        legendEl.hidden = false;
        const chips = series
          .map(
            (s) =>
              `<span class="godeye-legend__chip" style="--chip:${esc(s.color)}"><span class="godeye-legend__swatch" aria-hidden="true"></span>${esc(
                s.label
              )}</span>`
          )
          .join("");
        const evChip = `<span class="godeye-legend__chip godeye-legend__chip--events" style="--chip:${esc(
          eventColor
        )}"><span class="godeye-legend__swatch" aria-hidden="true"></span>GPU-related Event Viewer markers</span>`;
        legendEl.innerHTML = `${evChip}${chips}`;
      }

      if (wrapEl) wrapEl.hidden = false;
    }

    function render() {
      if (!isAdvancedModeOn()) {
        if (panel instanceof HTMLElement) panel.hidden = true;
        if (wrapEl) wrapEl.hidden = true;
        if (legendEl) legendEl.hidden = true;
        setStatus(
          "Turn on <strong>Advanced</strong> to enable GPU God&rsquo;s Eye. This merged timeline is intentionally hidden in the standard workflow."
        );
        return;
      }
      if (panel instanceof HTMLElement) panel.hidden = false;

      resizeCanvasToCssPixels();
      draw();
    }

    window.addEventListener("rv-gpu-hub", schedule);
    window.addEventListener("rv-evtx-hub", schedule);
    window.addEventListener("resize", schedule);
    panel.addEventListener("godeyeresize", schedule);

    const mo = new MutationObserver(() => schedule());
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-advanced"] });

    schedule();
  }

  /** Tabs use URL hash + CSS :target (links in HTML). This syncs legacy hashes, ARIA, and GPU chart resize. */
  function setupWorkspaceTabs() {
    const root = document.getElementById("workspace");
    if (!root) return;
    const TAB_BASE = [
      "#tool-panel-system",
      "#tool-panel-bsod",
      "#tool-panel-gpu",
      "#tool-panel-evtx",
      "#tool-panel-dxdiag",
    ];
    const GODS_EYE_HASH = "#tool-panel-gods-eye";
    const LEGACY = {
      "#system": "#tool-panel-system",
      "#bsod": "#tool-panel-bsod",
      "#gpu": "#tool-panel-gpu",
      "#evtx": "#tool-panel-evtx",
      "#dxdiag": "#tool-panel-dxdiag",
      "#godeye": GODS_EYE_HASH,
      "#godseye": GODS_EYE_HASH,
    };

    function allowedWorkspaceHashes() {
      const list = TAB_BASE.slice();
      if (document.documentElement.getAttribute("data-advanced") === "on") list.push(GODS_EYE_HASH);
      return list;
    }

    /** @returns {string} */
    function canonicalPanelHash() {
      const raw = (location.hash || "").split("?")[0].toLowerCase();
      if (!raw) return "#tool-panel-system";
      const mapped = LEGACY[raw] || raw;
      if (mapped === GODS_EYE_HASH && document.documentElement.getAttribute("data-advanced") !== "on") {
        return "#tool-panel-system";
      }
      return allowedWorkspaceHashes().includes(mapped) ? mapped : "#tool-panel-system";
    }

    function replaceHashIfNeeded() {
      const raw = (location.hash || "").split("?")[0].toLowerCase();
      if (!raw) return;
      const mapped = LEGACY[raw] || raw;
      const allowed = allowedWorkspaceHashes();
      if (LEGACY[raw] && allowed.includes(mapped)) {
        try {
          history.replaceState(null, "", mapped);
        } catch {
          /* file:// or restricted */
        }
        return;
      }
      if (allowed.includes(mapped)) return;
      try {
        history.replaceState(null, "", `${location.pathname}${location.search}`);
      } catch {
        /* file:// or restricted */
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
      if (canonicalPanelHash() === GODS_EYE_HASH) {
        document.querySelector(".panel--godeye")?.dispatchEvent(new CustomEvent("godeyeresize", { bubbles: false }));
      }
    }

    window.addEventListener("hashchange", onWorkspaceHash);
    window.addEventListener("rv-workspace-sync", onWorkspaceHash);

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

    /** <kbd>Shift</kbd>+1 … 6 — switch tools (uses <code>code</code> so symbol layouts still map to digits; skipped in fields and while About dialog is open). */
    document.addEventListener("keydown", (e) => {
      if (!e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
      const digit =
        e.code === "Digit1"
          ? 1
          : e.code === "Digit2"
            ? 2
            : e.code === "Digit3"
              ? 3
              : e.code === "Digit4"
                ? 4
                : e.code === "Digit5"
                  ? 5
                  : e.code === "Digit6"
                    ? 6
                    : 0;
      if (!digit) return;
      const t = /** @type {HTMLElement | null} */ (e.target);
      if (t?.closest("input, textarea, select, [contenteditable=true]")) return;
      const aboutDlg = document.getElementById("about-dialog");
      if (aboutDlg instanceof HTMLDialogElement && aboutDlg.open) return;
      const tabs = [...root.querySelectorAll("a.tool-tab[href]:not([hidden])")];
      if (digit > tabs.length) return;
      e.preventDefault();
      const tab = tabs[digit - 1];
      if (tab instanceof HTMLAnchorElement) tab.click();
    });

    root.addEventListener("keydown", (e) => {
      const el = /** @type {HTMLElement | null} */ (e.target);
      if (!el || !el.classList.contains("tool-tab")) return;
      const tabs = [...root.querySelectorAll("a.tool-tab[href]:not([hidden])")];
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

  /** Fixed control: scroll to top of page (theme-aligned; shown after modest scroll). */
  function setupScrollToTop() {
    const btn = document.getElementById("scroll-to-top");
    if (!(btn instanceof HTMLButtonElement)) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let ticking = false;
    const threshold = 280;

    function applyVisibility() {
      ticking = false;
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      if (y > threshold) {
        btn.hidden = false;
        btn.classList.add("scroll-to-top--visible");
      } else {
        btn.classList.remove("scroll-to-top--visible");
        btn.hidden = true;
      }
    }

    function onScroll() {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(applyVisibility);
      }
    }

    btn.addEventListener("click", () => {
      window.scrollTo({
        top: 0,
        left: 0,
        behavior: reduceMotion.matches ? "auto" : "smooth",
      });
    });

    window.addEventListener("scroll", onScroll, { passive: true });
    applyVisibility();
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

  const PDF_EXPORT_SECTIONS = [
    { hash: "#tool-panel-system", title: "System Information" },
    { hash: "#tool-panel-bsod", title: "BSOD & WinDbg" },
    { hash: "#tool-panel-gpu", title: "GPU-Z logs" },
    { hash: "#tool-panel-evtx", title: "Event Viewer" },
    { hash: "#tool-panel-dxdiag", title: "DxDiag" },
  ];
  /** Sections included in PDF when using “All report tabs” (System + BSOD omitted by product choice). */
  const PDF_EXPORTABLE_SECTIONS = PDF_EXPORT_SECTIONS.filter(
    (s) => s.hash !== "#tool-panel-system" && s.hash !== "#tool-panel-bsod"
  );
  const LEGACY_TAB_HASH = {
    "#system": "#tool-panel-system",
    "#bsod": "#tool-panel-bsod",
    "#gpu": "#tool-panel-gpu",
    "#evtx": "#tool-panel-evtx",
    "#dxdiag": "#tool-panel-dxdiag",
  };
  const TAB_HREFS = PDF_EXPORT_SECTIONS.map((s) => s.hash);

  function canonicalPdfHash() {
    const raw = (location.hash || "").split("?")[0].toLowerCase();
    if (!raw) return "#tool-panel-system";
    const mapped = LEGACY_TAB_HASH[raw] || raw;
    return TAB_HREFS.includes(mapped) ? mapped : "#tool-panel-system";
  }

  const PDF_DIALOG_TAB_LABELS = {
    system: "System Information",
    bsod: "BSOD & WinDbg",
    gpu: "GPU-Z logs",
    evtx: "Event Viewer",
    dxdiag: "DxDiag",
  };

  /** @returns {keyof typeof PDF_DIALOG_TAB_LABELS} */
  function getPdfDialogTheme() {
    const m = {
      "#tool-panel-system": "system",
      "#tool-panel-bsod": "bsod",
      "#tool-panel-gpu": "gpu",
      "#tool-panel-evtx": "evtx",
      "#tool-panel-dxdiag": "dxdiag",
    };
    const h = canonicalPdfHash();
    return m[h] || "system";
  }

  function syncPdfDialogTheme() {
    const d = document.getElementById("pdf-export-dialog");
    const kicker = document.getElementById("pdf-dialog-kicker");
    if (!d) return;
    const key = getPdfDialogTheme();
    d.setAttribute("data-pdf-theme", key);
    if (kicker) {
      kicker.textContent = PDF_DIALOG_TAB_LABELS[key] || "Report tools";
    }
  }

  function panelHasPdfContent(panel) {
    if (!panel) return false;
    const h = (panel.getAttribute("id") || "").replace("tool-panel-", "");
    if (h === "system")
      return !!(function () {
        const b = panel.querySelector(".system-body");
        return b && !b.hidden;
      })();
    if (h === "bsod")
      return !!(function () {
        const b = panel.querySelector(".bsod-body");
        return b && !b.hidden;
      })();
    if (h === "gpu") {
      const w = panel.querySelector(".analyzer-chart-wrap");
      if (w && !w.hidden) return true;
      return !!(panel.querySelector(".analyzer-charts")?.querySelector("canvas"));
    }
    if (h === "evtx")
      return !!(function () {
        const b = panel.querySelector(".evtx-body");
        return b && !b.hidden;
      })();
    if (h === "dxdiag")
      return !!(function () {
        const b = panel.querySelector(".dxdiag-body");
        return b && !b.hidden;
      })();
    return false;
  }

  /**
   * @param {HTMLCanvasElement} c
   * @param {HTMLCanvasElement} src
   */
  function copyCanvasForPdfClone(c, src) {
    if (!c || !src || !src.getContext) return;
    c.width = src.width;
    c.height = src.height;
    c.getContext("2d")?.drawImage(src, 0, 0);
  }

  /**
   * @param {HTMLElement} clone
   * @param {HTMLElement} source
   */
  function syncAllCanvasesInCloneForPdf(clone, source) {
    const srcC = source.querySelectorAll("canvas");
    const dstC = clone.querySelectorAll("canvas");
    for (let i = 0; i < srcC.length && i < dstC.length; i++) {
      const s = srcC[i];
      const d = dstC[i];
      if (s instanceof HTMLCanvasElement && d instanceof HTMLCanvasElement) copyCanvasForPdfClone(d, s);
    }
  }

  /**
   * @param {HTMLElement} root
   */
  function scrubForPdfClone(root) {
    root.querySelectorAll("input[type=file], input.file-input, .file-input--multi").forEach((el) => {
      if (el.parentNode) el.parentNode.removeChild(el);
    });
    root.querySelectorAll(".dropzone").forEach((el) => {
      if (el.parentNode) el.parentNode.removeChild(el);
    });
    root.querySelectorAll(".panel-load-job, .bsod-paste, .bsod-paste__actions, .bsod-or-divider").forEach((el) => {
      if (el.parentNode) el.parentNode.removeChild(el);
    });
    root
      .querySelectorAll("button, .system-toolbar, .bsod-toolbar, .analyzer-toolbar, .evtx-toolbar, .dxdiag-toolbar")
      .forEach((el) => {
        if (el.parentNode) el.parentNode.removeChild(el);
      });
    root.querySelectorAll("nav, .site-header, .site-footer, .tool-tabs, .theme-toggle, .scroll-to-top").forEach(
      (el) => {
        if (el.parentNode) el.parentNode.removeChild(el);
      }
    );
    root.querySelectorAll("[id]").forEach((el) => {
      if (el.hasAttribute("id")) el.removeAttribute("id");
    });
    root.querySelectorAll("details").forEach((d) => {
      d.setAttribute("open", "");
    });
  }

  const PDF_PNG_COMP = undefined;
  const PDF_H2C_SCALE = 2.9;
  const PDF_H2C_SCALE_WIDE = 3.35;
  const PDF_H2C_MONOLITH = 2.9;
  const PDF_MIN_LAST_SLICE_PX = 100;
  /** @see styles.css --bg-deep / light body (must match on-screen + html2canvas) */
  const PDF_H2C_BG_DARK = "#0a0e0c";
  const PDF_H2C_BG_LIGHT = "#f8fafc";

  /**
   * Fills the **current** PDF page to match the export theme (paper behind screenshots).
   * @param {import("jspdf").jsPDF} pdf
   * @param {boolean} useLight
   */
  function pdfFillPageBackground(/** @type {import("jspdf").jsPDF} */ pdf, useLight) {
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    if (useLight) {
      pdf.setFillColor(248, 250, 252);
    } else {
      pdf.setFillColor(10, 14, 12);
    }
    pdf.rect(0, 0, pageW, pageH, "F");
  }

  /**
   * @param {import("jspdf").jsPDF} pdf
   * @param {"p"|"l"} orientation
   * @param {boolean} [fillTheme] If set, fills the new page with the export background (avoids white margins in dark mode).
   */
  function pdfAddContentPageA4(/** @type {import("jspdf").jsPDF} */ pdf, orientation, fillTheme) {
    try {
      // @ts-ignore
      pdf.addPage("a4", orientation);
    } catch {
      pdf.addPage();
    }
    if (typeof fillTheme === "boolean") {
      pdfFillPageBackground(pdf, fillTheme);
    }
  }

  function pdfAddOrphanPage(/** @type {import("jspdf").jsPDF} */ pdf, useLight) {
    pdf.addPage();
    pdfFillPageBackground(pdf, useLight);
  }

  function addSlicedCanvasToPdf(/** @type {import("jspdf").jsPDF} */ pdf, source, useLight) {
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const m = 24;
    const maxW = pageW - 2 * m;
    const maxH = pageH - 2 * m;
    const scale = maxW / source.width;
    const fullH = source.height * scale;
    if (fullH <= maxH) {
      pdfFillPageBackground(pdf, useLight);
      pdf.addImage(source, "PNG", m, m, maxW, fullH, undefined, PDF_PNG_COMP, 0);
      return;
    }
    const pxPerPage = maxH / scale;
    /** @type {{ y0: number, hPx: number }[]} */
    const rows = [];
    let y = 0;
    while (y < source.height) {
      const hPx = Math.min(pxPerPage, source.height - y);
      rows.push({ y0: y, hPx });
      y += hPx;
    }
    if (rows.length >= 2) {
      const last = rows[rows.length - 1];
      const prev = rows[rows.length - 2];
      if (last.hPx < PDF_MIN_LAST_SLICE_PX && (prev.hPx + last.hPx) * scale <= maxH * 1.01) {
        prev.hPx += last.hPx;
        rows.pop();
      }
    }
    let isFirst = true;
    const contOrient = pageW > pageH ? "l" : "p";
    for (const row of rows) {
      if (!isFirst) {
        pdfAddContentPageA4(pdf, contOrient, useLight);
      } else {
        pdfFillPageBackground(pdf, useLight);
      }
      isFirst = false;
      const s = document.createElement("canvas");
      s.width = source.width;
      s.height = Math.max(1, Math.ceil(row.hPx));
      s.getContext("2d")?.drawImage(source, 0, row.y0, source.width, row.hPx, 0, 0, s.width, s.height);
      const hDraw = s.height * scale;
      pdf.addImage(s, "PNG", m, m, maxW, hDraw, undefined, PDF_PNG_COMP, 0);
    }
  }

  /**
   * Scale the entire image onto one page (no mid-block cuts). If very tall, it shrinks to fit the printable area.
   * @param {import("jspdf").jsPDF} pdf
   * @param {HTMLCanvasElement} source
   * @param {boolean} useLight
   */
  function addCanvasFittedToOnePage(pdf, source, useLight) {
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const m = 24;
    const maxW = pageW - 2 * m;
    const maxH = pageH - 2 * m;
    const s = Math.min(maxW / source.width, maxH / source.height);
    const drawW = source.width * s;
    const drawH = source.height * s;
    pdfFillPageBackground(pdf, useLight);
    pdf.addImage(source, "PNG", m, m, drawW, drawH, undefined, PDF_PNG_COMP, 0);
  }

  /**
   * Stack block captures; prefer full page width (no narrow “letterbox” on the right).
   * @param {import("jspdf").jsPDF} pdf
   * @param {HTMLCanvasElement} cnv
   * @param {{ y: number, m?: number, gap?: number, pageO?: "l" | "p", needsNewPage?: boolean, useLight?: boolean }} state
   * @param {{ noSlice?: boolean }} [opts] If noSlice, tall blocks scale to one page (used for .analyzer-chart-block so the plot is not split into axis-only slivers).
   */
  function addCanvasPackedToPdf(pdf, cnv, state, opts) {
    const noSlice = Boolean(opts && opts.noSlice);
    const useLight = state.useLight !== false;
    const pageH = pdf.internal.pageSize.getHeight();
    const pageW = pdf.internal.pageSize.getWidth();
    const m = state.m == null ? 24 : state.m;
    const gap = state.gap == null ? 2 : state.gap;
    const maxW = pageW - 2 * m;
    const maxH = pageH - 2 * m;
    const bottom = pageH - m;

    if (state.needsNewPage) {
      if (state.pageO === "l") {
        pdfAddContentPageA4(pdf, "l", useLight);
      } else if (state.pageO === "p") {
        pdfAddContentPageA4(pdf, "p", useLight);
      } else {
        pdfAddOrphanPage(pdf, useLight);
      }
      state.y = m;
      state.needsNewPage = false;
    }

    const hAtMaxW = (cnv.height * maxW) / cnv.width;

    if (hAtMaxW > maxH && noSlice) {
      if (state.y > m) {
        if (state.pageO === "l") {
          pdfAddContentPageA4(pdf, "l", useLight);
        } else if (state.pageO === "p") {
          pdfAddContentPageA4(pdf, "p", useLight);
        } else {
          pdfAddOrphanPage(pdf, useLight);
        }
        state.y = m;
      }
      addCanvasFittedToOnePage(pdf, cnv, useLight);
      state.needsNewPage = true;
      return;
    }

    if (hAtMaxW > maxH) {
      if (state.y > m) {
        if (state.pageO === "l") {
          pdfAddContentPageA4(pdf, "l", useLight);
        } else if (state.pageO === "p") {
          pdfAddContentPageA4(pdf, "p", useLight);
        } else {
          pdfAddOrphanPage(pdf, useLight);
        }
        state.y = m;
      }
      addSlicedCanvasToPdf(pdf, cnv, useLight);
      state.needsNewPage = true;
      return;
    }

    const drawW = maxW;
    const drawH = hAtMaxW;
    if (state.y + drawH > bottom) {
      if (state.pageO === "l") {
        pdfAddContentPageA4(pdf, "l", useLight);
      } else if (state.pageO === "p") {
        pdfAddContentPageA4(pdf, "p", useLight);
      } else {
        pdfAddOrphanPage(pdf, useLight);
      }
      state.y = m;
    }
    if (state.y === m) {
      pdfFillPageBackground(pdf, useLight);
    }
    pdf.addImage(cnv, "PNG", m, state.y, drawW, drawH, undefined, PDF_PNG_COMP, 0);
    state.y += drawH + gap;
  }

  /** @param {Element | null} el */
  function pdfBlockIsUsable(/** @type {Element} */ el) {
    if (!el || !(el instanceof HTMLElement)) return false;
    if (el.hasAttribute("hidden") && el.getAttribute("hidden") !== "false") return false;
    if (el.hidden) return false;
    if (el.getAttribute("aria-hidden") === "true") return false;
    const st = getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden") return false;
    const r = el.getBoundingClientRect();
    return r.width > 2 && r.height > 2;
  }

  /**
   * GPU-Z: one capture per block so charts/insights are never cut across a page (whole block scaled to fit each page).
   * @param {HTMLElement} panel
   * @returns {HTMLElement[]}
   */
  function getGpuPanelPdfBlockElements(panel) {
    /** @type {HTMLElement[]} */
    const out = [];
    for (const sel of [".panel__head", ".analyzer-chips", ".analyzer-controls", ".analyzer-alerts", ".analyzer-insights--dashboard"]) {
      const el = panel.querySelector(sel);
      if (pdfBlockIsUsable(/** @type {HTMLElement} */ (el))) out.push(/** @type {HTMLElement} */ (el));
    }
    panel.querySelectorAll(".analyzer-chart-block").forEach((el) => {
      if (el instanceof HTMLElement && pdfBlockIsUsable(el)) out.push(el);
    });
    const stats = panel.querySelector(".analyzer-stats");
    if (stats instanceof HTMLElement && pdfBlockIsUsable(stats)) {
      out.push(stats);
    }
    return out;
  }

  /**
   * DxDiag: one capture per card / section / source block so borders are not cut mid-card (avoids monolithic canvas slice).
   * @param {HTMLElement} panel
   * @returns {HTMLElement[]}
   */
  function getDxDiagPanelPdfBlockElements(panel) {
    /** @type {HTMLElement[]} */
    const out = [];
    for (const sel of [".panel__head", ".dxdiag-toolbar"]) {
      const el = panel.querySelector(sel);
      if (el instanceof HTMLElement && pdfBlockIsUsable(/** @type {HTMLElement} */(el))) {
        out.push(el);
      }
    }
    const parseNote = panel.querySelector(".dxdiag-parse-note");
    if (
      parseNote instanceof HTMLElement &&
      (parseNote.textContent || "").trim() &&
      pdfBlockIsUsable(parseNote)
    ) {
      out.push(parseNote);
    }
    const inner = panel.querySelector(".dxdiag-summary-inner");
    const sum = panel.querySelector(".dxdiag-summary");
    const walkRoot = inner || sum;
    if (walkRoot) {
      walkRoot.querySelectorAll(":scope > *").forEach((el) => {
        if (el instanceof HTMLElement && pdfBlockIsUsable(el)) {
          out.push(el);
        }
      });
    } else {
      panel.querySelectorAll(".dxdiag-summary .dxdiag-card").forEach((el) => {
        if (el instanceof HTMLElement && pdfBlockIsUsable(el)) {
          out.push(el);
        }
      });
    }
    const raw = panel.querySelector("details.dxdiag-raw");
    if (raw instanceof HTMLElement && pdfBlockIsUsable(raw)) {
      out.push(raw);
    }
    return out;
  }

  /**
   * Cloned block fragments (e.g. .analyzer-controls) are not under .panel--* so theme selectors miss.
   * Re-wrap in the same panel shell as the source tab so html[data-theme] + .panel--* CSS applies in html2canvas.
   * @param {HTMLElement} panel
   * @param {HTMLElement} clone
   * @returns {HTMLElement}
   */
  function wrapPdfBlockCloneInPanelShell(panel, clone) {
    if (!clone || !(panel instanceof HTMLElement)) {
      return clone;
    }
    if (clone.classList && clone.classList.contains("panel") && clone.classList.contains("tool-panel")) {
      return clone;
    }
    const skin = document.createElement("div");
    skin.setAttribute("class", panel.getAttribute("class") || "panel");
    Object.assign(skin.style, {
      display: "block",
      boxShadow: "none",
      border: "none",
      borderRadius: "0",
      minHeight: "0",
      maxWidth: "100%",
      margin: "0",
      padding: "0",
      background: "transparent",
    });
    skin.appendChild(clone);
    return skin;
  }

  /**
   * @param {HTMLElement} live
   * @param {HTMLElement} _panelContext
   * @param {boolean} useLight
   * @param {boolean} includeReportSectionTitle
   * @param {string} sectionTitle
   * @param {function(Element, *): Promise<HTMLCanvasElement>} h2c
   * @param {{ wide?: boolean }} [blockOpts] — wide: wider capture for landscape GPU pages
   */
  async function captureOnePdfBlockToCanvas(
    live,
    _panelContext,
    useLight,
    includeReportSectionTitle,
    sectionTitle,
    h2c,
    blockOpts
  ) {
    const wide = Boolean(blockOpts && blockOpts.wide);
    const docScale = wide ? PDF_H2C_SCALE_WIDE : PDF_H2C_SCALE;
    const wrap = document.createElement("div");
    wrap.className = "pdf-export-fragment";
    if (includeReportSectionTitle) {
      const h1 = document.createElement("h1");
      h1.textContent = sectionTitle;
      h1.style.margin = "0 0 0.2rem 0";
      h1.style.font = '600 0.95rem/1.25 system-ui, "Segoe UI", sans-serif';
      h1.style.letterSpacing = "0.02em";
      h1.style.color = useLight ? "#0f172a" : "#e8f0eb";
      wrap.appendChild(h1);
    }
    const clone = live.cloneNode(true);
    if (clone instanceof HTMLElement) {
      if (live instanceof HTMLElement) {
        syncAllCanvasesInCloneForPdf(clone, live);
        scrubForPdfClone(clone);
        clone.removeAttribute("hidden");
        if (clone.classList && clone.classList.contains("dxdiag-raw")) {
          const preWrap = clone.querySelector(".dxdiag-raw__pre-wrap");
          if (preWrap instanceof HTMLElement) {
            preWrap.style.setProperty("max-height", "none", "important");
            preWrap.style.setProperty("overflow", "visible", "important");
            preWrap.style.setProperty("height", "auto", "important");
          }
          const pre = clone.querySelector(".content--dxdiag");
          if (pre instanceof HTMLElement) {
            pre.style.setProperty("max-height", "none", "important");
          }
        }
        /* Do not set !important color/background on the fragment: it breaks .panel--* [data-theme] rules (metrics, matrix). */
      }
      clone.style.maxWidth = "100%";
    }
    const toMount =
      _panelContext instanceof HTMLElement && clone instanceof HTMLElement
        ? wrapPdfBlockCloneInPanelShell(_panelContext, clone)
        : clone;
    if (toMount) {
      wrap.appendChild(toMount);
    }
    wrap.style.setProperty("background", useLight ? PDF_H2C_BG_LIGHT : PDF_H2C_BG_DARK, "important");
    if (!useLight) {
      wrap.style.setProperty("color", "inherit", "important");
    }
    Object.assign(wrap.style, {
      position: "absolute",
      left: "-12000px",
      top: "0",
      zIndex: "2147483600",
      width: wide ? "1100px" : "920px",
      boxSizing: "border-box",
      padding: wide ? "4px 12px 8px" : "4px 10px 8px",
    });
    document.body.appendChild(wrap);
    await new Promise((r) => setTimeout(r, 40));
    // @ts-ignore
    const cnv = await h2c(wrap, {
      scale: docScale,
      useCORS: true,
      allowTaint: true,
      backgroundColor: useLight ? PDF_H2C_BG_LIGHT : PDF_H2C_BG_DARK,
      logging: false,
      onclone(/** @type {Document} */ doc, /** @type {HTMLElement} */ el) {
        if (doc && doc.documentElement) {
          doc.documentElement.setAttribute("data-theme", useLight ? "light" : "dark");
        }
        if (doc && doc.body) {
          if (useLight) {
            doc.body.style.setProperty("background", PDF_H2C_BG_LIGHT, "important");
            doc.body.style.setProperty("color", "#0f172a", "important");
          } else {
            doc.body.style.setProperty("background", PDF_H2C_BG_DARK, "important");
            doc.body.style.setProperty("color", "#e8f0eb", "important");
          }
        }
        if (useLight) {
          el.querySelectorAll("pre, .content, code").forEach((n) => {
            if (n instanceof HTMLElement) {
              n.style.setProperty("background", "#f1f5f9", "important");
              n.style.setProperty("color", "#0f172a", "important");
            }
          });
        }
      },
    });
    if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
    if (!(cnv instanceof HTMLCanvasElement) || cnv.width < 2 || cnv.height < 2) {
      throw new Error("Empty block capture");
    }
    return cnv;
  }

  function setupPdfExport() {
    const openBtn = document.getElementById("pdf-export-open");
    const dlg = document.getElementById("pdf-export-dialog");
    const goBtn = document.getElementById("pdf-export-go");
    const status = document.getElementById("pdf-export-status");
    const unav = document.getElementById("pdf-export-unavailable");
    const fieldset = document.getElementById("pdf-export-fieldset");
    const lightChk = document.getElementById("pdf-light-bg");
    const exportPanel = document.getElementById("pdf-export-panel");
    const exportBar = document.getElementById("pdf-export-bar");
    const exportBarFill = document.getElementById("pdf-export-bar-fill");
    const exportHeading = document.getElementById("pdf-export-heading");

    // @ts-ignore
    const JsPDF = window.jspdf && window.jspdf.jsPDF;
    // @ts-ignore
    const h2c = typeof window !== "undefined" && window.html2canvas;
    const libsOk = Boolean(JsPDF && h2c);
    if (unav) unav.hidden = libsOk;
    if (fieldset) fieldset.disabled = !libsOk;
    if (goBtn) goBtn.disabled = !libsOk;
    if (!libsOk) {
      if (openBtn) {
        openBtn.setAttribute("title", "Add vendor/jspdf.umd.min.js and vendor/html2canvas.min.js next to index.html (offline, no network).");
      }
    }

    function setStatus(msg, isErr) {
      if (status) {
        status.textContent = msg;
        status.classList.toggle("pdf-dialog__status--err", Boolean(isErr));
      }
    }

    function resetPdfExportPanel() {
      if (exportPanel) {
        exportPanel.hidden = true;
        exportPanel.classList.remove("pdf-dialog__export-panel--success");
      }
      if (exportBarFill) exportBarFill.style.width = "0%";
      if (exportBar) {
        exportBar.setAttribute("aria-valuenow", "0");
        exportBar.removeAttribute("aria-valuetext");
      }
      if (exportHeading) exportHeading.textContent = "Exporting";
    }

    /** @param {number} pct 0–100 */
    function setPdfExportBarPct(pct) {
      const n = Math.max(0, Math.min(100, Math.round(pct)));
      if (exportBarFill) exportBarFill.style.width = `${n}%`;
      if (exportBar) {
        exportBar.setAttribute("aria-valuenow", String(n));
        exportBar.setAttribute("aria-valuetext", `${n} percent`);
      }
    }

    function showPdfExportProgressUI() {
      if (exportPanel) {
        exportPanel.hidden = false;
        exportPanel.classList.remove("pdf-dialog__export-panel--success");
      }
      if (exportHeading) exportHeading.textContent = "Exporting";
      setPdfExportBarPct(0);
    }

    function showPdfExportDoneUI() {
      if (exportPanel) {
        exportPanel.hidden = false;
        exportPanel.classList.add("pdf-dialog__export-panel--success");
      }
      if (exportHeading) exportHeading.textContent = "Exported";
      setPdfExportBarPct(100);
    }

    /* <dialog> does not fire a reliable "open" event in all browsers; sync on this click, before showModal, so data-pdf-theme matches location.hash. */
    openBtn?.addEventListener("click", () => {
      const h = canonicalPdfHash();
      if (h === "#tool-panel-system" || h === "#tool-panel-bsod") return;
      if (dlg instanceof HTMLDialogElement) {
        setStatus("");
        resetPdfExportPanel();
        if (lightChk) {
          const siteLight = (document.documentElement.getAttribute("data-theme") || "dark") === "light";
          lightChk.checked = siteLight;
        }
        syncPdfDialogTheme();
        dlg.showModal();
      }
    });

    window.addEventListener("hashchange", () => {
      if (dlg instanceof HTMLDialogElement && dlg.open) {
        syncPdfDialogTheme();
      }
    });

    dlg?.addEventListener("click", (e) => {
      if ((/** @type {HTMLElement} */ (e.target)).closest("[data-pdf-close]")) {
        if (dlg instanceof HTMLDialogElement) dlg.close();
      }
    });

    dlg?.addEventListener("close", () => {
      if (goBtn) goBtn.disabled = !libsOk;
      if (fieldset) fieldset.disabled = !libsOk;
      if (lightChk) lightChk.disabled = !libsOk;
      resetPdfExportPanel();
      if (dlg) dlg.removeAttribute("aria-busy");
    });

    goBtn?.addEventListener("click", async () => {
      if (!libsOk) return;
      if (!(JsPDF && h2c) || !dlg) return;
      const scopeInp = document.querySelector('input[name="pdf-scope"]:checked');
      const allTabs = !scopeInp || (/** @type {HTMLInputElement} */ (scopeInp).value || "all") === "all";
      const useLight = !lightChk || /** @type {HTMLInputElement} */ (lightChk).checked;
      const startHash = location.hash || "";
      // @ts-ignore
      const jsPDF = JsPDF;
      if (!jsPDF) return;
      let exportFinishedOk = false;
      if (goBtn) goBtn.disabled = true;
      if (fieldset) fieldset.disabled = true;
      if (lightChk) lightChk.disabled = true;
      if (dlg) dlg.setAttribute("aria-busy", "true");
      showPdfExportProgressUI();
      setPdfExportBarPct(2);
      setStatus("Preparing…");

      try {
        const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "p" });
        const w = pdf.internal.pageSize.getWidth();
        const h0 = pdf.internal.pageSize.getHeight();
        pdfFillPageBackground(pdf, useLight);
        if (useLight) {
          pdf.setTextColor(20, 40, 20);
        } else {
          pdf.setTextColor(120, 196, 80);
        }
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(20);
        pdf.text("NVIDIA Report Viewer", w / 2, 88, { align: "center" });
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(10.5);
        if (useLight) {
          pdf.setTextColor(55, 60, 65);
        } else {
          pdf.setTextColor(200, 220, 210);
        }
        pdf.text(`v${APP_VERSION} · local export (offline) · no cloud`, w / 2, 115, { align: "center" });
        pdf.text(new Date().toLocaleString(), w / 2, 132, { align: "center" });
        pdf.setFontSize(8.5);
        if (useLight) {
          pdf.setTextColor(0, 0, 0);
        } else {
          pdf.setTextColor(150, 168, 158);
        }
        pdf.text(
          "This PDF is generated entirely in the browser. Files and parsed text are not sent to a server. Share this document with the customer on your own channels.",
          40,
          h0 - 44,
          { maxWidth: w - 80, align: "left" }
        );
        if (useLight) {
          pdf.setTextColor(0, 0, 0);
        } else {
          pdf.setTextColor(232, 240, 235);
        }
        const delay = (ms) => new Promise((r) => setTimeout(r, ms));
        const sections = allTabs
          ? PDF_EXPORTABLE_SECTIONS.slice()
          : PDF_EXPORTABLE_SECTIONS.filter((s) => s.hash === canonicalPdfHash());
        const totalSections = Math.max(1, sections.length);
        setPdfExportBarPct(4);

        for (let si = 0; si < sections.length; si++) {
          setPdfExportBarPct(4 + (si / totalSections) * 90);
          const { hash, title } = sections[si];
          setStatus(`Capturing: ${title}…`);
          try {
            history.replaceState(null, "", hash);
            await delay(200);
            const p = document.getElementById(hash.slice(1));

            if (!p) {
              pdfAddContentPageA4(pdf, "p", useLight);
              if (useLight) {
                pdf.setTextColor(20, 40, 20);
              } else {
                pdf.setTextColor(232, 240, 235);
              }
              pdf.setFont("helvetica", "bold");
              pdf.setFontSize(12);
              pdf.text(title, 40, 56);
              pdf.setFont("helvetica", "normal");
              pdf.setFontSize(10);
              if (useLight) {
                pdf.setTextColor(0, 0, 0);
              } else {
                pdf.setTextColor(200, 215, 205);
              }
              pdf.text("This section could not be found.", 40, 80);
              continue;
            }
            if (!panelHasPdfContent(/** @type {HTMLElement} */ (p))) {
              pdfAddContentPageA4(pdf, "p", useLight);
              if (useLight) {
                pdf.setTextColor(20, 40, 20);
              } else {
                pdf.setTextColor(232, 240, 235);
              }
              pdf.setFont("helvetica", "bold");
              pdf.setFontSize(12);
              pdf.text(title, 40, 56);
              pdf.setFont("helvetica", "normal");
              pdf.setFontSize(10);
              if (useLight) {
                pdf.setTextColor(0, 0, 0);
              } else {
                pdf.setTextColor(200, 215, 205);
              }
              pdf.text(
                "No analysis in this section yet. Load a file in this tool, then export the PDF again.",
                40,
                80,
                { maxWidth: w - 80 }
              );
              continue;
            }

            if (hash === "#tool-panel-gpu" && p.classList.contains("panel--gpu")) {
              const blocks = getGpuPanelPdfBlockElements(/** @type {HTMLElement} */ (p));
              if (blocks.length > 0) {
                const appTheme = document.documentElement.getAttribute("data-theme") || "dark";
                try {
                  const targetT = useLight ? "light" : "dark";
                  document.documentElement.setAttribute("data-theme", targetT);
                  p.dispatchEvent(new CustomEvent("gpuresize", { bubbles: false }));
                  await delay(320);
                  pdfAddContentPageA4(pdf, "l", useLight);
                  const pack = {
                    y: 24,
                    gap: 2,
                    m: 24,
                    pageO: /** @type {"l"} */ ("l"),
                    useLight,
                  };
                  for (let bi = 0; bi < blocks.length; bi++) {
                    const cnv = await captureOnePdfBlockToCanvas(
                      blocks[bi],
                      /** @type {HTMLElement} */ (p),
                      useLight,
                      bi === 0,
                      title,
                      h2c,
                      { wide: true }
                    );
                    const isChartBlock = blocks[bi].classList?.contains("analyzer-chart-block");
                    addCanvasPackedToPdf(pdf, cnv, pack, { noSlice: isChartBlock });
                  }
                } finally {
                  document.documentElement.setAttribute("data-theme", appTheme);
                  p.dispatchEvent(new CustomEvent("gpuresize", { bubbles: false }));
                  await delay(120);
                }
                await delay(0);
                await yieldToMain();
                continue;
              }
            }

            if (hash === "#tool-panel-dxdiag" && p.classList.contains("panel--dxdiag")) {
              p.querySelectorAll("details.dxdiag-raw").forEach((d) => {
                if (d instanceof HTMLDetailsElement) d.open = true;
              });
              await delay(80);
              const dxBlocks = getDxDiagPanelPdfBlockElements(/** @type {HTMLElement} */(p));
              if (dxBlocks.length > 0) {
                pdfAddContentPageA4(pdf, "p", useLight);
                const pack = {
                  y: 24,
                  gap: 2,
                  m: 24,
                  pageO: /** @type {"p"} */ ("p"),
                  useLight,
                };
                for (let bi = 0; bi < dxBlocks.length; bi++) {
                  const cnv = await captureOnePdfBlockToCanvas(
                    dxBlocks[bi],
                    /** @type {HTMLElement} */(p),
                    useLight,
                    bi === 0,
                    title,
                    h2c
                  );
                    if (dxBlocks[bi].classList?.contains("dxdiag-raw")) {
                    const mTop = pack.m == null ? 24 : pack.m;
                    if (pack.y > mTop) {
                      pdfAddContentPageA4(pdf, "p", useLight);
                    }
                    addSlicedCanvasToPdf(pdf, cnv, useLight);
                  } else {
                    addCanvasPackedToPdf(pdf, cnv, pack);
                  }
                }
                await delay(0);
                await yieldToMain();
                continue;
              }
            }

            const wrap = document.createElement("div");
            wrap.className = "pdf-export-wrapper";
            const h = document.createElement("h1");
            h.style.margin = "0 0 0.4rem 0";
            h.style.font = '600 16px/1.2 system-ui, "Segoe UI", sans-serif';
            h.style.letterSpacing = "0.02em";
            h.textContent = title;
            const inner = p.cloneNode(true);
            if (p instanceof HTMLElement && inner instanceof HTMLElement) {
              inner.style.maxWidth = "880px";
              inner.style.position = "relative";
              inner.style.left = "0";
              inner.style.top = "0";
              inner.style.display = "block";
              inner.removeAttribute("hidden");
              inner.style.padding = "8px 12px 14px";
            }
            syncAllCanvasesInCloneForPdf(/** @type {HTMLElement} */ (inner), /** @type {HTMLElement} */ (p));
            scrubForPdfClone(/** @type {HTMLElement} */ (inner));
            wrap.style.setProperty("background", useLight ? PDF_H2C_BG_LIGHT : PDF_H2C_BG_DARK, "important");
            wrap.appendChild(h);
            wrap.appendChild(inner);
            document.body.appendChild(wrap);
            Object.assign(wrap.style, {
              position: "absolute",
              left: "-12000px",
              top: "0",
              zIndex: "2147483500",
              width: "900px",
              boxSizing: "border-box",
            });
            if (h instanceof HTMLElement) {
              h.style.setProperty("color", useLight ? "#0f172a" : "#e8f0eb", "important");
            }
            await delay(40);
            // @ts-ignore
            const cnv = await h2c(wrap, {
              scale: PDF_H2C_MONOLITH,
              useCORS: true,
              allowTaint: true,
              backgroundColor: useLight ? PDF_H2C_BG_LIGHT : PDF_H2C_BG_DARK,
              logging: false,
              onclone(/** @type {Document} */ doc, /** @type {HTMLElement} */ el) {
                if (doc && doc.documentElement) {
                  doc.documentElement.setAttribute("data-theme", useLight ? "light" : "dark");
                }
                if (doc && doc.body) {
                  if (useLight) {
                    doc.body.style.setProperty("background", PDF_H2C_BG_LIGHT, "important");
                    doc.body.style.setProperty("color", "#0f172a", "important");
                  } else {
                    doc.body.style.setProperty("background", PDF_H2C_BG_DARK, "important");
                    doc.body.style.setProperty("color", "#e8f0eb", "important");
                  }
                }
                if (useLight) {
                  el.querySelectorAll("pre, .content, code").forEach((n) => {
                    if (n instanceof HTMLElement) {
                      n.style.setProperty("background", "#f1f5f9", "important");
                      n.style.setProperty("color", "#0f172a", "important");
                    }
                  });
                }
              },
            });
            if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
            if (!(cnv instanceof HTMLCanvasElement)) {
              throw new Error("html2canvas did not return a canvas.");
            }
            if (cnv.width < 2 || cnv.height < 2) {
              throw new Error("Empty capture. Try a smaller file or a different tab.");
            }
            pdfAddContentPageA4(pdf, "p", useLight);
            addSlicedCanvasToPdf(pdf, cnv, useLight);
            await delay(0);
            await yieldToMain();
          } catch (e) {
            console.error("PDF section failed:", title, e);
            pdfAddContentPageA4(pdf, "p", useLight);
            if (useLight) {
              pdf.setTextColor(20, 40, 20);
            } else {
              pdf.setTextColor(232, 240, 235);
            }
            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(12);
            pdf.text(title, 40, 56);
            pdf.setFont("helvetica", "normal");
            pdf.setFontSize(10);
            if (useLight) {
              pdf.setTextColor(0, 0, 0);
            } else {
              pdf.setTextColor(200, 215, 205);
            }
            const msg = e && /** @type {any} */ (e).message ? String(/** @type {any} */ (e).message) : String(e);
            pdf.text("Could not capture this section. " + msg, 40, 80, { maxWidth: w - 80 });
          }
        }

        setPdfExportBarPct(95);
        const ymd = new Date();
        const name = `NVIDIA-Report-Viewer-v${APP_VERSION}-${
          ymd.getFullYear()
        }-${String(ymd.getMonth() + 1).padStart(2, "0")}-${String(ymd.getDate()).padStart(2, "0")}.pdf`;
        pdf.save(name);
        exportFinishedOk = true;
        setStatus("Saved: " + name);
        showPdfExportDoneUI();
        if (dlg instanceof HTMLDialogElement) setTimeout(() => dlg.close(), 600);
      } catch (e) {
        console.error("PDF export failed", e);
        resetPdfExportPanel();
        setStatus("Export failed. " + (e && /** @type {any} */ (e).message ? String(/** @type {any} */ (e).message) : String(e)), true);
      } finally {
        if (!exportFinishedOk) {
          if (goBtn) goBtn.disabled = !libsOk;
          if (fieldset) fieldset.disabled = !libsOk;
          if (lightChk) lightChk.disabled = !libsOk;
        }
        if (dlg) dlg.removeAttribute("aria-busy");
        try {
          if (startHash) history.replaceState(null, "", startHash);
        } catch {
          /* */
        }
      }
    });

    syncPdfDialogTheme();
  }

  function setupAdvancedHub() {
    const ADVANCED_LS = "log-viewer-advanced";
    const toggle = document.getElementById("advanced-toggle");
    const inline = document.getElementById("advanced-inline");
    const palette = document.getElementById("command-palette-dialog");
    const modeOff = document.getElementById("advanced-mode-off");
    const paletteFilter = document.getElementById("command-palette-filter");
    const paletteList = document.getElementById("command-palette-list");

    function isAdvanced() {
      return document.documentElement.getAttribute("data-advanced") === "on";
    }

    function setAdvanced(on) {
      if (on) {
        document.documentElement.setAttribute("data-advanced", "on");
        try {
          localStorage.setItem(ADVANCED_LS, "1");
        } catch {
          /* */
        }
      } else {
        document.documentElement.removeAttribute("data-advanced");
        try {
          localStorage.removeItem(ADVANCED_LS);
        } catch {
          /* */
        }
      }
      syncToggleUi();
    }

    function syncToggleUi() {
      const on = isAdvanced();
      if (toggle) {
        toggle.setAttribute("aria-expanded", on ? "true" : "false");
        toggle.textContent = on ? "Advanced · on" : "Advanced";
      }
      if (inline) inline.hidden = !on;
      const godsTab = document.getElementById("tab-gods-eye");
      if (godsTab instanceof HTMLElement) {
        if (on) {
          godsTab.removeAttribute("hidden");
          godsTab.setAttribute("aria-hidden", "false");
        } else {
          godsTab.setAttribute("hidden", "");
          godsTab.setAttribute("aria-hidden", "true");
          const h = (location.hash || "").split("?")[0].toLowerCase();
          if (h === "#tool-panel-gods-eye") {
            try {
              history.replaceState(null, "", "#tool-panel-system");
            } catch {
              /* */
            }
          }
        }
      }
      queueMicrotask(() => {
        try {
          window.dispatchEvent(new Event("rv-workspace-sync"));
        } catch {
          /* */
        }
      });
    }

    toggle?.addEventListener("click", () => {
      if (!inline) return;
      if (!isAdvanced()) {
        setAdvanced(true);
        requestAnimationFrame(() => {
          try {
            inline.scrollIntoView({ behavior: "smooth", block: "nearest" });
          } catch {
            /* */
          }
        });
        return;
      }
      setAdvanced(false);
      if (palette instanceof HTMLDialogElement) palette.close();
    });

    modeOff?.addEventListener("click", () => {
      setAdvanced(false);
      if (palette instanceof HTMLDialogElement) palette.close();
    });

    const PALETTE_CMDS = [
      { label: "Go: System Information", run: () => { location.hash = "#tool-panel-system"; } },
      { label: "Go: BSOD & WinDbg", run: () => { location.hash = "#tool-panel-bsod"; } },
      { label: "Go: GPU-Z logs", run: () => { location.hash = "#tool-panel-gpu"; } },
      { label: "Go: Event Viewer", run: () => { location.hash = "#tool-panel-evtx"; } },
      { label: "Go: DxDiag", run: () => { location.hash = "#tool-panel-dxdiag"; } },
      { label: "Go: GPU God's Eye (merged timeline)", run: () => { location.hash = "#tool-panel-gods-eye"; } },
      {
        label: "Toggle light / dark theme",
        run: () => {
          const next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
          document.documentElement.setAttribute("data-theme", next);
          try {
            localStorage.setItem("log-viewer-theme", next);
          } catch {
            /* */
          }
          const tt = document.getElementById("theme-toggle");
          if (tt) tt.setAttribute("aria-label", next === "light" ? "Switch to dark mode" : "Switch to light mode");
        },
      },
      {
        label: "Open System tab & Advanced compare",
        run: () => {
          setAdvanced(true);
          try {
            location.hash = "#tool-panel-system";
          } catch {
            /* */
          }
          if (inline) {
            requestAnimationFrame(() => {
              try {
                inline.scrollIntoView({ behavior: "smooth", block: "nearest" });
              } catch {
                /* */
              }
            });
          }
        },
      },
    ];

    function renderPaletteList(filter) {
      if (!paletteList) return;
      const q = (filter || "").toLowerCase();
      paletteList.innerHTML = "";
      PALETTE_CMDS.filter((c) => !q || c.label.toLowerCase().includes(q)).forEach((cmd) => {
        const li = document.createElement("li");
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = cmd.label;
        b.addEventListener("click", () => {
          cmd.run();
          if (palette instanceof HTMLDialogElement) palette.close();
        });
        li.appendChild(b);
        paletteList.appendChild(li);
      });
    }

    paletteFilter?.addEventListener("input", () => {
      if (paletteFilter instanceof HTMLInputElement) renderPaletteList(paletteFilter.value);
    });

    palette?.addEventListener("click", (e) => {
      if ((/** @type {HTMLElement} */ (e.target)).closest("[data-palette-close]")) {
        if (palette instanceof HTMLDialogElement) palette.close();
      }
    });

    document.addEventListener("keydown", (e) => {
      if (!isAdvanced()) return;
      const t = /** @type {HTMLElement | null} */ (e.target);
      if (t?.closest("input, textarea, select, [contenteditable=true]") && !(e.ctrlKey && e.code === "KeyK")) return;
      if ((e.ctrlKey || e.metaKey) && e.code === "KeyK" && !e.altKey) {
        e.preventDefault();
        if (!(palette instanceof HTMLDialogElement)) return;
        renderPaletteList("");
        palette.showModal();
        setTimeout(() => paletteFilter?.focus(), 30);
      }
    });

    syncToggleUi();
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
  document.querySelectorAll(".panel--evtx").forEach((p) => {
    try {
      setupEvtxPanel(p);
    } catch (err) {
      console.error("Event Viewer panel init failed:", err);
    }
  });
  document.querySelectorAll(".panel--dxdiag").forEach((p) => {
    try {
      setupDxDiagPanel(p);
    } catch (err) {
      console.error("DxDiag panel init failed:", err);
    }
  });
  document.querySelectorAll(".panel--godeye").forEach((p) => {
    try {
      setupGodsEyePanel(p);
    } catch (err) {
      console.error("GPU God's Eye panel init failed:", err);
    }
  });
  setupWorkspaceTabs();
  setupSkipLinkFocus();
  setupScrollToTop();
  setupAboutDialog();
  setupPdfExport();
  setupAdvancedHub();
})();
