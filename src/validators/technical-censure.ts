// =============================================================================
// Technical Censure — єдиний стандарт технічної цензури для планів та задач
// Конвертовано з: control_center/standards/plans/std-technical-censure.md
// =============================================================================

import type {
  CensureRule,
  CensureVerdict,
  PreconditionCheck,
} from "../types";

// --- Метадані ---
// Визначає 31 обов'язкову перевірку (5 блоків: архітектура, безпека,
// персистентність, тестування, B2B readiness) перед збереженням плану або задачі.
// Порушення будь-якого правила = блокування збереження.
// Інструмент: використовується кроками L8, L9, D3, D4.

// =============================================================================
// 1. Типи (специфічні для цього валідатора)
// =============================================================================

type CensureLevel = "plan" | "task";

interface CensureResult {
  rule_id: string;
  verdict: CensureVerdict;
  reason: string;
}

interface CensureReport {
  all_passed: boolean;
  results: CensureResult[];
  blocked_count: number;
  passed_count: number;
  level: CensureLevel;
  /** Позначка: всі PASS на першому проході → виконано повторну перевірку A+B (захист від сикофансії) */
  recheck_performed: boolean;
}

interface CensureInputContext {
  /** Рівень перевірки: план або задача */
  level: CensureLevel;
  /** Текстовий вміст плану або задачі */
  content: string;
  /** Тип проекту (з final_view/) */
  project_type: "solo" | "multi";
  /** Чи використовує проект Docker */
  uses_docker: boolean;
  /** Чи має проект API endpoints */
  has_api: boolean;
  /** Чи має проект AI/LLM endpoints */
  has_ai_endpoints: boolean;
  /** Чи має проект зовнішні залежності (DB, external API) */
  has_external_dependencies: boolean;
  /** Чи є проект B2B (multi-user/team) — визначається з final_view/ */
  is_b2b: boolean;
  /** Чи зчитано final_view/ перед цензурою */
  final_view_read: boolean;
  /** Чи зчитано цей стандарт у поточній сесії */
  standard_read: boolean;
  /** Чи сформовано чернетку плану/задачі */
  draft_ready: boolean;
}

interface EdgeCase {
  scenario: string;
  action: string;
}

// =============================================================================
// 2. Правила (31 правило: 24 оригінальних A–D + 7 нових E — B2B Readiness)
// =============================================================================

/** Яким рівням (plan/task/both) відповідає кожне правило */
const RULE_LEVELS: Record<string, CensureLevel | "both"> = {
  // Блок A — Архітектурна цензура
  A1: "both", A2: "both", A3: "both", A4: "both", A5: "task", A6: "task",
  // Блок B — Технічна безпека
  B1: "both", B2: "both", B3: "both", B4: "both", B5: "task", B6: "both",
  // Блок C — Персистентність
  C1: "both", C2: "both", C3: "both", C4: "task", C5: "plan",
  // Блок D — Верифікація
  D1: "both", D2: "both", D3: "plan", D4: "task", D5: "task", D6: "both", D7: "plan",
  // Блок E — B2B Readiness
  E1: "both", E2: "both", E3: "both", E4: "plan", E5: "both", E6: "task", E7: "task",
};

const RULES: CensureRule[] = [
  // ── Блок A — Архітектурна цензура (Бритва Оккама) ──
  {
    id: "A1",
    block: "architecture",
    name: "Заборона надлишкових сутностей",
    violation_criteria: "Ролі, RBAC, групи, multi-tenancy — якщо проект solo-user",
  },
  {
    id: "A2",
    block: "architecture",
    name: "Пріоритет лінійності",
    violation_criteria:
      "Мікросервіси, складні абстракції, шини повідомлень — якщо задача вирішується прямою функцією",
  },
  {
    id: "A3",
    block: "architecture",
    name: "Заборона «майбутніх потреб»",
    violation_criteria:
      "Інфраструктура для функцій, яких немає в final_view/. Формулювання: «підготувати ґрунт», «закласти основу»",
  },
  {
    id: "A4",
    block: "architecture",
    name: "Відповідність масштабу",
    violation_criteria:
      "Рішення непропорційне задачі (ORM для 2 таблиць, CI/CD для прототипу)",
  },
  {
    id: "A5",
    block: "architecture",
    name: "Найкоротший шлях (задачі)",
    violation_criteria:
      "Задача реалізується найкоротшим і найнадійнішим технічним шляхом. Жодних класів/інтерфейсів «на майбутнє»",
  },
  {
    id: "A6",
    block: "architecture",
    name: "Централізований конфіг (задачі)",
    violation_criteria:
      "Шляхи, URL, порти — через config/ або змінні середовища. Hardcode заборонено",
  },

  // ── Блок B — Технічна безпека (Zero Tolerance) ──
  {
    id: "B1",
    block: "security",
    name: "Зберігання токенів/секретів",
    violation_criteria:
      "localStorage, sessionStorage для токенів. Єдино допустимий метод — HttpOnly Cookies",
  },
  {
    id: "B2",
    block: "security",
    name: "Стабільність конфігурації",
    violation_criteria:
      "Динамічна генерація секретів у пам'яті без збереження в .env/config.json",
  },
  {
    id: "B3",
    block: "security",
    name: "Захист доступу",
    violation_criteria:
      "Відсутність валідації доступу. Пряме скачування БД/JSON без авторизації",
  },
  {
    id: "B4",
    block: "security",
    name: "Hardcoded credentials",
    violation_criteria:
      "Паролі, ключі, токени в коді або конфігах, що потрапляють в репозиторій",
  },
  {
    id: "B5",
    block: "security",
    name: "API стектрейси (задачі)",
    violation_criteria:
      "API не повертає стектрейси клієнту. Деталі помилок — тільки в логах",
  },
  {
    id: "B6",
    block: "security",
    name: "Rate limiting та cost caps",
    violation_criteria:
      "API endpoints мають rate limiting. AI/LLM endpoints мають per-user cost caps. Відсутність = ризик DDoS та фінансових втрат",
  },

  // ── Блок C — Персистентність та виробничий реалізм ──
  {
    id: "C1",
    block: "persistence",
    name: "Docker-сумісність",
    violation_criteria: "Дані втрачаються після docker-compose down && up",
  },
  {
    id: "C2",
    block: "persistence",
    name: "Персистентність стану",
    violation_criteria:
      "Критичні стани (сесії, ліміти, таймери) тільки в оперативній пам'яті",
  },
  {
    id: "C3",
    block: "persistence",
    name: "Відновлюваність",
    violation_criteria: "Не описано поведінку при збої (crash recovery)",
  },
  {
    id: "C4",
    block: "persistence",
    name: "Атомарний запис (задачі)",
    violation_criteria:
      "Запис у файли — через тимчасовий файл → перейменування. Direct write заборонено для критичних даних",
  },
  {
    id: "C5",
    block: "persistence",
    name: "Бюджет продуктивності (плани)",
    violation_criteria:
      "План повинен визначити performance budget: page load < 3 с, API response < 500 мс, JS bundle < 300 KB (gzip). Перевищення = блокер для релізу",
  },

  // ── Блок D — Глибина верифікації (Testing) ──
  {
    id: "D1",
    block: "testing",
    name: "Негативні тести",
    violation_criteria:
      "Нова логіка без тестів на невалідні дані, збої сесії, порушення цілісності",
  },
  {
    id: "D2",
    block: "testing",
    name: "Не косметичні виправлення",
    violation_criteria:
      "Зміна тексту помилки замість фундаментального виправлення вразливості",
  },
  {
    id: "D3",
    block: "testing",
    name: "Test Strategy (плани)",
    violation_criteria:
      "План не містить опису системних тестів після виконання",
  },
  {
    id: "D4",
    block: "testing",
    name: "Тести доступу (задачі)",
    violation_criteria:
      "Захищені дії без тесту на спробу без токена або з невалідним токеном",
  },
  {
    id: "D5",
    block: "testing",
    name: "Тести збоїв (задачі)",
    violation_criteria:
      "Зовнішні залежності без сценарію обробки збою",
  },
  {
    id: "D6",
    block: "testing",
    name: "Заборона 100% mock coverage",
    violation_criteria:
      "ВСІ тести задачі мокають ВСІ зовнішні залежності (DB, API). Мінімум 1 тест на задачу повинен працювати з реальною або in-memory DB і перевіряти бізнес-логіку",
  },
  {
    id: "D7",
    block: "testing",
    name: "Квота integration тестів (плани)",
    violation_criteria:
      "План повинен визначити в Test Strategy: мінімум 20% тестів — integration (без моків зовнішніх залежностей)",
  },
  // ── Блок E — B2B Readiness (Multi-user / Team) ──
  {
    id: "E1",
    block: "b2b_readiness",
    name: "Multi-tenancy / Data Isolation",
    violation_criteria:
      "B2B проект без tenant ізоляції даних. Кожна таблиця з user-owned даними має filtration по user_id/org_id",
  },
  {
    id: "E2",
    block: "b2b_readiness",
    name: "Role-Based Access (мінімум)",
    violation_criteria:
      "B2B проект без рольової моделі. Мінімум: owner/member рівні. Відсутність = будь-хто в організації має повний доступ",
  },
  {
    id: "E3",
    block: "b2b_readiness",
    name: "Audit Trail для критичних дій",
    violation_criteria:
      "B2B проект без логування критичних мутацій (створення/видалення ресурсів, зміна billing, зміна доступу). Клієнти очікують audit log",
  },
  {
    id: "E4",
    block: "b2b_readiness",
    name: "Onboarding Flow у плані",
    violation_criteria:
      "План не описує onboarding flow (перший вхід → перша цінність). B2B churn #1 причина: 'вони просто перестали користуватись'",
  },
  {
    id: "E5",
    block: "b2b_readiness",
    name: "Data Export можливість",
    violation_criteria:
      "B2B проект без можливості вивантаження даних. GDPR compliance + anti-lock-in — B2B клієнти вимагають export",
  },
  {
    id: "E6",
    block: "b2b_readiness",
    name: "API Idempotency для мутацій",
    violation_criteria:
      "Критичні мутації (webhook handlers, payment processing, resource creation) без idempotency keys. Retry = дублікат",
  },
  {
    id: "E7",
    block: "b2b_readiness",
    name: "Human-readable Error UX",
    violation_criteria:
      "API повертає технічні помилки кінцевому користувачу. B2B користувач не розуміє stack traces — потрібні людиночитабельні повідомлення",
  },];

// =============================================================================
// 3. Preconditions (POKA-YOKE)
// =============================================================================

const PRECONDITIONS: PreconditionCheck[] = [
  {
    type: "state_field",
    field: "status",
    expected_value: "in_progress",
    description: "P1: Чернетка плану/задача сформована — цензура не запускається без чернетки",
  },
  {
    type: "dir_not_empty",
    path: "control_center/final_view/",
    description:
      "P2: Файли final_view/ зчитані — неможливо оцінити адекватність без контексту продукту",
  },
];

// =============================================================================
// 4. Edge Cases (крайні випадки)
// =============================================================================

const EDGE_CASES: EdgeCase[] = [
  {
    scenario: "Етап/задача не стосується блоку B (безпека)",
    action:
      "Позначити B пункти як «не стосується». Блоки A, C, D обов'язкові",
  },
  {
    scenario: "Проект не використовує Docker",
    action: "C1 = «не стосується». C2, C3 обов'язкові",
  },
  {
    scenario: "Конфлікт між final_view/ і правилом цензури",
    action: "Цензура має пріоритет. Зафіксувати конфлікт в issue",
  },
  {
    scenario: "Усі етапи заблоковані",
    action: "Ескалація. План потребує переосмислення",
  },
];

// =============================================================================
// 5. Helpers
// =============================================================================

function makePass(rule: CensureRule): CensureResult {
  return { rule_id: rule.id, verdict: "PASS", reason: "Відповідає вимогам" };
}

function makeBlock(rule: CensureRule, reason: string): CensureResult {
  return { rule_id: rule.id, verdict: "BLOCK", reason };
}

/** Повертає правила, що застосовуються для заданого рівня (plan/task) */
function getApplicableRules(level: CensureLevel): CensureRule[] {
  return RULES.filter((rule) => {
    const ruleLevel = RULE_LEVELS[rule.id];
    return ruleLevel === "both" || ruleLevel === level;
  });
}

/**
 * Повертає правила, релевантні для конкретної задачі —
 * для вбудовування в секцію Acceptance Criteria (§4.3 крок 2).
 * Фільтрує за рівнем "task" + контекстною релевантністю.
 */
function getRelevantRulesForTask(context: CensureInputContext): CensureRule[] {
  return getApplicableRules("task").filter((rule) => {
    // Пропустити C1 якщо проект не використовує Docker
    if (rule.id === "C1" && !context.uses_docker) return false;
    // Пропустити B5, D4 якщо немає API
    if ((rule.id === "B5" || rule.id === "D4") && !context.has_api) return false;
    // Пропустити D5 якщо немає зовнішніх залежностей
    if (rule.id === "D5" && !context.has_external_dependencies) return false;
    // Пропустити B6 якщо немає API і AI endpoints
    if (rule.id === "B6" && !context.has_api && !context.has_ai_endpoints) return false;
    return true;
  });
}

// =============================================================================
// 6. Перевірка передумов
// =============================================================================

function checkPreconditions(context: CensureInputContext): CensureResult[] {
  const failures: CensureResult[] = [];

  if (!context.draft_ready) {
    failures.push({
      rule_id: "P1",
      verdict: "BLOCK",
      reason: "Чернетка плану/задачі не сформована — цензура не запускається",
    });
  }
  if (!context.final_view_read) {
    failures.push({
      rule_id: "P2",
      verdict: "BLOCK",
      reason: "Файли final_view/ не зчитані — неможливо оцінити адекватність",
    });
  }
  if (!context.standard_read) {
    failures.push({
      rule_id: "P3",
      verdict: "BLOCK",
      reason: "Стандарт цензури не зчитаний у поточній сесії",
    });
  }

  return failures;
}

// =============================================================================
// 7. Оцінка окремого правила
// =============================================================================

function evaluateRule(
  rule: CensureRule,
  context: CensureInputContext,
): CensureResult {
  const { content } = context;

  switch (rule.id) {
    // ── Блок A — Архітектурна цензура ──

    case "A1": {
      // Solo-проекти не повинні мати RBAC, ролей, multi-tenancy
      if (context.project_type === "solo") {
        const match = content.match(
          /\b(rbac|role[_\s-]?based|multi[_\s-]?tenan|permission[_\s-]?group)/i,
        );
        if (match) {
          return makeBlock(rule, `Solo-проект містить надлишкові сутності: "${match[1]}"`);
        }
      }
      return makePass(rule);
    }

    case "A2": {
      const match = content.match(
        /\b(мікросервіс|microservice|message[_\s-]?bus|event[_\s-]?driven|шин[аиу] повідомлень)/i,
      );
      if (match) {
        return makeBlock(
          rule,
          `Зайва складність: "${match[1]}" — перевірити чи не вирішується прямою функцією`,
        );
      }
      return makePass(rule);
    }

    case "A3": {
      const match = content.match(
        /(підготувати ґрунт|закласти основу|на майбутнє|future[_\s-]?proof|про запас)/i,
      );
      if (match) {
        return makeBlock(rule, `Формулювання «майбутніх потреб»: "${match[1]}"`);
      }
      return makePass(rule);
    }

    case "A4": {
      // ORM для малого числа таблиць, CI/CD для прототипу
      const match = content.match(
        /\b(ORM.{0,30}(2|двох?|одн).{0,15}табли|CI\/CD.{0,30}(прототип|mvp|poc))/i,
      );
      if (match) {
        return makeBlock(rule, `Рішення непропорційне задачі: "${match[0]}"`);
      }
      return makePass(rule);
    }

    case "A5": {
      // Класи/інтерфейси «на майбутнє» у задачі
      const match = content.match(
        /(клас.{0,25}на майбутнє|інтерфейс.{0,25}на майбутнє|abstract[_\s]?factory.{0,20}(just in case|на всяк|запас))/i,
      );
      if (match) {
        return makeBlock(rule, `Не найкоротший шлях реалізації: "${match[0]}"`);
      }
      return makePass(rule);
    }

    case "A6": {
      // Hardcoded шляхи, URL, порти (якщо немає згадки config/env)
      const hasHardcode = /\b(hardcode|хардкод|"http:\/\/|"https:\/\/|localhost:\d{4}|"\/api\/)/i.test(content);
      const hasConfig = /\b(config|\.env|environment|змінн.{0,5}середовищ)/i.test(content);
      if (hasHardcode && !hasConfig) {
        return makeBlock(
          rule,
          "Hardcoded значення (URL/порти/шляхи) без централізованого конфігу",
        );
      }
      return makePass(rule);
    }

    // ── Блок B — Технічна безпека ──

    case "B1": {
      const match = content.match(
        /\b(localStorage|sessionStorage)\b.{0,40}(token|secret|ключ|токен)/i,
      );
      if (match) {
        return makeBlock(rule, `Токени у ${match[1]} — єдино допустимий метод: HttpOnly Cookies`);
      }
      // Зворотна перевірка: token + localStorage у будь-якому порядку
      const matchReverse = content.match(
        /\b(token|токен).{0,40}(localStorage|sessionStorage)/i,
      );
      if (matchReverse) {
        return makeBlock(rule, `Токени у ${matchReverse[2]} — єдино допустимий метод: HttpOnly Cookies`);
      }
      return makePass(rule);
    }

    case "B2": {
      const match = content.match(
        /(генеру.{0,25}секрет.{0,25}(пам'ят|memory|runtime)|random.{0,25}secret.{0,20}(memory|пам'ят))/i,
      );
      if (match) {
        return makeBlock(
          rule,
          `Динамічна генерація секретів без збереження: "${match[0]}"`,
        );
      }
      return makePass(rule);
    }

    case "B3": {
      const match = content.match(
        /(без авторизаці|without auth|пряме скачування|direct download.{0,30}(db|database|json))/i,
      );
      if (match) {
        return makeBlock(rule, `Відсутня валідація доступу: "${match[0]}"`);
      }
      return makePass(rule);
    }

    case "B4": {
      const match = content.match(
        /(password\s*[:=]\s*["'][^"']+["']|api[_-]?key\s*[:=]\s*["'][^"']+["']|secret\s*[:=]\s*["'][^"']+["'])/i,
      );
      if (match) {
        return makeBlock(
          rule,
          `Hardcoded credentials: "${match[0].substring(0, 40)}..."`,
        );
      }
      return makePass(rule);
    }

    case "B5": {
      if (!context.has_api) return makePass(rule);
      const match = content.match(
        /(stack[_\s-]?trace.{0,30}(client|response|клієнт|відповід)|стектрейс.{0,30}(client|відповід|response))/i,
      );
      if (match) {
        return makeBlock(rule, `API повертає стектрейси клієнту: "${match[0]}"`);
      }
      return makePass(rule);
    }

    case "B6": {
      if (!context.has_api && !context.has_ai_endpoints) return makePass(rule);
      const hasRateLimit = /rate[_\s-]?limit/i.test(content);
      if (context.has_api && !hasRateLimit) {
        return makeBlock(rule, "API endpoints без rate limiting — ризик DDoS");
      }
      if (context.has_ai_endpoints) {
        const hasCostCap = /cost[_\s-]?cap|ліміт.{0,15}витрат|per[_\s-]?user.{0,15}(limit|cap)/i.test(content);
        if (!hasCostCap) {
          return makeBlock(rule, "AI/LLM endpoints без per-user cost caps — ризик фінансових втрат");
        }
      }
      return makePass(rule);
    }

    // ── Блок C — Персистентність ──

    case "C1": {
      // Edge case: проект не використовує Docker → не стосується
      if (!context.uses_docker) return makePass(rule);
      const mentionsData = /\b(дані|data|state|стан|session|сесі)/i.test(content);
      const hasVolumes = /\b(volume|persist|mount|персистент)/i.test(content);
      if (mentionsData && !hasVolumes) {
        return makeBlock(
          rule,
          "Docker використовується, але не згадано volumes/persistence — дані можуть втратитись",
        );
      }
      return makePass(rule);
    }

    case "C2": {
      const match = content.match(
        /(тільки.{0,15}(пам'ят|memory|ram)|in[_\s-]?memory[_\s-]?only|volatile.{0,25}(session|state|сесі|стан))/i,
      );
      if (match) {
        return makeBlock(
          rule,
          `Критичні стани тільки в оперативній пам'яті: "${match[0]}"`,
        );
      }
      return makePass(rule);
    }

    case "C3": {
      const hasCrashRecovery =
        /crash[_\s-]?recovery|відновлен|recovery.{0,15}(сценарій|plan|стратегі)|збій.{0,25}(опис|сценарій|поведінк)/i.test(
          content,
        );
      if (!hasCrashRecovery) {
        return makeBlock(rule, "Не описано поведінку при збої (crash recovery)");
      }
      return makePass(rule);
    }

    case "C4": {
      const writesFiles = /write.{0,25}(file|файл)|запис.{0,25}(файл|disk)|fs\.(write|append)/i.test(content);
      if (writesFiles) {
        const hasAtomicWrite =
          /atomic|атомарн|temp.{0,15}(file|файл)|тимчасов.{0,15}файл|rename|перейменуван/i.test(
            content,
          );
        if (!hasAtomicWrite) {
          return makeBlock(
            rule,
            "Запис у файли без атомарного підходу (тимчасовий файл → перейменування)",
          );
        }
      }
      return makePass(rule);
    }

    case "C5": {
      const hasBudget =
        /performance[_\s-]?budget|бюджет.{0,15}продуктивн|page[_\s-]?load.{0,10}\d|api[_\s-]?response.{0,10}\d|bundle[_\s-]?size.{0,10}\d/i.test(
          content,
        );
      if (!hasBudget) {
        return makeBlock(
          rule,
          "План не визначає performance budget (page load < 3с, API < 500мс, bundle < 300KB)",
        );
      }
      return makePass(rule);
    }

    // ── Блок D — Верифікація (Testing) ──

    case "D1": {
      const hasNewLogic =
        /нов.{0,15}(логік|функці|компонент|модул)|new.{0,15}(logic|feature|component|module)/i.test(
          content,
        );
      if (hasNewLogic) {
        const hasNegativeTests =
          /негативн.{0,15}тест|negative[_\s-]?test|invalid.{0,25}(data|input)|edge[_\s-]?case|невалідн/i.test(
            content,
          );
        if (!hasNegativeTests) {
          return makeBlock(rule, "Нова логіка без тестів на невалідні дані та edge cases");
        }
      }
      return makePass(rule);
    }

    case "D2": {
      const match = content.match(
        /(змін.{0,25}(текст|повідомленн).{0,25}помилк|change.{0,25}error.{0,25}(message|text))/i,
      );
      if (match) {
        return makeBlock(
          rule,
          `Косметичне виправлення замість фундаментального: "${match[0]}"`,
        );
      }
      return makePass(rule);
    }

    case "D3": {
      const hasTestStrategy =
        /test[_\s-]?strategy|стратегі.{0,15}тест|системн.{0,15}тест.{0,25}після/i.test(
          content,
        );
      if (!hasTestStrategy) {
        return makeBlock(rule, "План не містить опису системних тестів (Test Strategy)");
      }
      return makePass(rule);
    }

    case "D4": {
      if (!context.has_api) return makePass(rule);
      const hasAccessTests =
        /тест.{0,35}(без токен|невалідн.{0,15}токен|unauthorized|401|forbidden|403)/i.test(
          content,
        );
      if (!hasAccessTests) {
        return makeBlock(
          rule,
          "Захищені дії без тесту на спробу без/з невалідним токеном",
        );
      }
      return makePass(rule);
    }

    case "D5": {
      if (!context.has_external_dependencies) return makePass(rule);
      const hasFailureTests =
        /тест.{0,35}(збій|збої|failure|timeout|fallback)|сценарій.{0,25}(збій|обробк)/i.test(
          content,
        );
      if (!hasFailureTests) {
        return makeBlock(
          rule,
          "Зовнішні залежності без сценарію обробки збою в тестах",
        );
      }
      return makePass(rule);
    }

    case "D6": {
      // Перевірка: згадуються тільки моки без жодного integration тесту
      const hasMocks = /(vi\.mock|jest\.mock)\s*\(/i.test(content);
      const hasIntegration =
        /integration|in[_\s-]?memory[_\s-]?db|реальн.{0,15}(db|бд|база)|інтеграці.{0,15}тест/i.test(
          content,
        );
      if (hasMocks && !hasIntegration) {
        return makeBlock(
          rule,
          "100% mock coverage — відсутній integration тест з реальною/in-memory DB",
        );
      }
      return makePass(rule);
    }

    case "D7": {
      const hasIntegrationQuota =
        /integration.{0,35}(20%|двадцят)|20%.{0,35}integration|квота.{0,25}інтеграці|мінімум.{0,25}integration/i.test(
          content,
        );
      if (!hasIntegrationQuota) {
        return makeBlock(
          rule,
          "Test Strategy не визначає мінімум 20% integration тестів",
        );
      }
      return makePass(rule);
    }

    // ── Блок E — B2B Readiness ──

    case "E1": {
      if (!context.is_b2b) return makePass(rule);
      const hasTenantIsolation =
        /tenant[_\s-]?id|org[_\s-]?id|user[_\s-]?id.{0,30}(filter|where|ізоляці)|data[_\s-]?isolation|ізоляці.{0,20}даних/i.test(content);
      if (!hasTenantIsolation) {
        return makeBlock(rule, "B2B проект без описаної ізоляції даних (tenant_id/user_id filtering)");
      }
      return makePass(rule);
    }

    case "E2": {
      if (!context.is_b2b) return makePass(rule);
      const hasRoles =
        /role|роль|permission|дозвіл|owner|member|admin|viewer|rbac|access[_\s-]?level/i.test(content);
      if (!hasRoles) {
        return makeBlock(rule, "B2B проект без рольової моделі (owner/member/admin)");
      }
      return makePass(rule);
    }

    case "E3": {
      if (!context.is_b2b) return makePass(rule);
      const hasAudit =
        /audit[_\s-]?(trail|log)|логуванн.{0,20}(дій|мутацій|змін)|action[_\s-]?log|activity[_\s-]?log/i.test(content);
      if (!hasAudit) {
        return makeBlock(rule, "B2B проект без audit trail для критичних дій");
      }
      return makePass(rule);
    }

    case "E4": {
      // GUARD: onboarding обов'язковий лише для B2B (CLI tools / internal scripts — skip)
      if (!context.is_b2b) return makePass(rule);
      const hasOnboarding =
        /onboarding|перший вхід|first[_\s-]?run|guided[_\s-]?setup|welcome[_\s-]?flow|time[_\s-]?to[_\s-]?value/i.test(content);
      if (!hasOnboarding) {
        return makeBlock(rule, "B2B проект без onboarding flow → ризик churn з першого дня");
      }
      return makePass(rule);
    }

    case "E5": {
      if (!context.is_b2b) return makePass(rule);
      const hasExport =
        /export|вивантаженн|download.{0,15}data|csv|json[_\s-]?export|data[_\s-]?portability/i.test(content);
      if (!hasExport) {
        return makeBlock(rule, "B2B проект без можливості data export (GDPR + retention)");
      }
      return makePass(rule);
    }

    case "E6": {
      // NOTE: E6 навмисно universal (не лише B2B) — idempotency критична для будь-якого
      // проекту з webhooks/payments. Solo-проект з Stripe теж потребує retry-safety.
      const hasIdempotency =
        /idempoten|ідемпотент|idempotency[_\s-]?key|retry[_\s-]?safe|duplicate[_\s-]?prevent/i.test(content);
      const hasCriticalMutation =
        /webhook|payment|billing|stripe|створен.{0,15}(ресурс|order|замовлен)/i.test(content);
      if (hasCriticalMutation && !hasIdempotency) {
        return makeBlock(rule, "Критичні мутації (webhook/payment) без idempotency — retry створить дублікат");
      }
      return makePass(rule);
    }

    case "E7": {
      if (!context.has_api) return makePass(rule);
      const showsTechErrors =
        /stack[_\s-]?trace.{0,20}(user|UI|фронт|клієнт)|технічн.{0,15}помилк.{0,15}(показ|відобра)/i.test(content);
      if (showsTechErrors) {
        return makeBlock(rule, "Технічні помилки показуються кінцевому користувачу замість людиночитабельних");
      }
      return makePass(rule);
    }

    default:
      return makePass(rule);
  }
}

// =============================================================================
// 8. Основна функція валідації
// =============================================================================

/**
 * Валідація плану або задачі за 24 правилами цензури (4 блоки).
 *
 * Алгоритм:
 * 1. Перевірка передумов (POKA-YOKE)
 * 2. Фільтрація правил за рівнем (plan/task)
 * 3. Послідовна оцінка кожного правила
 * 4. Захист від сикофансії: якщо все PASS — повторна перевірка блоків A+B
 * 5. Формування звіту
 *
 * Збереження плану/задачі з порушеннями ЗАБОРОНЕНО.
 */
function validate(context: CensureInputContext): CensureReport {
  // Крок 1: Перевірка передумов
  const preconditionFailures = checkPreconditions(context);
  if (preconditionFailures.length > 0) {
    return {
      all_passed: false,
      results: preconditionFailures,
      blocked_count: preconditionFailures.length,
      passed_count: 0,
      level: context.level,
      recheck_performed: false,
    };
  }

  // Крок 2: Фільтрація правил
  const applicableRules = getApplicableRules(context.level);

  // Крок 3: Оцінка кожного правила
  const results: CensureResult[] = [];
  for (const rule of applicableRules) {
    results.push(evaluateRule(rule, context));
  }

  // Крок 4: Захист від сикофансії (§7 — слабка точка #3)
  // Якщо все PASS на першому проході — повторно перевірити блоки A та B
  const allPassedFirstRun = results.every((r) => r.verdict === "PASS");
  if (allPassedFirstRun) {
    const abRules = applicableRules.filter(
      (r) => r.block === "architecture" || r.block === "security",
    );
    for (const rule of abRules) {
      const recheckResult = evaluateRule(rule, context);
      const idx = results.findIndex((r) => r.rule_id === recheckResult.rule_id);
      if (idx !== -1) {
        results[idx] = recheckResult;
      }
    }
  }

  // Крок 5: Формування звіту
  return {
    all_passed: results.every((r) => r.verdict === "PASS"),
    results,
    blocked_count: results.filter((r) => r.verdict === "BLOCK").length,
    passed_count: results.filter((r) => r.verdict === "PASS").length,
    level: context.level,
    recheck_performed: allPassedFirstRun,
  };
}

// =============================================================================
// 9. Обмеження (ДОСЛІВНО з секції 8 Markdown)
// =============================================================================

const CONSTRAINTS: string[] = [
  "Заборонено зберігати план або задачу, що не пройшли цензуру.",
  "Заборонено пропускати блоки перевірки. Усі 5 блоків обов'язкові (A–E).",
  "Заборонено додавати «на майбутнє».",
  "Заборонено ігнорувати масштаб проекту.",
  "Заборонено використовувати localStorage/sessionStorage для токенів.",
  "Заборонено зберігати критичні стани тільки в оперативній пам'яті.",
  "Заборонено змінювати тести під код. Виправляти код, а не тести.",
  "Заборонено копіювати весь стандарт в задачу — тільки релевантні правила.",
  "Заборонено мати 100% mock coverage — мінімум 1 integration тест на задачу з реальною або in-memory DB, що перевіряє бізнес-логіку.",
  "Заборонено рахувати vi.mock() тести як докази працездатності. Вони доводять логіку, не інтеграцію.",
];

// =============================================================================
// 10. Exports
// =============================================================================

export {
  RULES,
  RULE_LEVELS,
  PRECONDITIONS,
  EDGE_CASES,
  CONSTRAINTS,
  validate,
  checkPreconditions,
  getApplicableRules,
  getRelevantRulesForTask,
  evaluateRule,
};

export type {
  CensureLevel,
  CensureResult,
  CensureReport,
  CensureInputContext,
  EdgeCase,
};
