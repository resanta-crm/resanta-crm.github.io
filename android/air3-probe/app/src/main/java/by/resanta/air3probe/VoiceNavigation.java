package by.resanta.air3probe;

import java.util.Locale;

/**
 * Read-only demonstration of the same navigation intents requested for RESANTA CRM.
 * Never executes clicks, RPC calls or mutations; real CRM authorization belongs to
 * the future shared AI360 backend and must be checked server-side.
 */
public final class VoiceNavigation {
    private VoiceNavigation() {}

    public static final class Result {
        public final String action;
        public final String title;
        public final boolean requiresConfirmation;

        public Result(String action, String title, boolean requiresConfirmation) {
            this.action = action;
            this.title = title;
            this.requiresConfirmation = requiresConfirmation;
        }
    }

    public static Result resolve(String spoken) {
        if (spoken == null) return unknown();
        final String q = spoken.toLowerCase(Locale.ROOT)
                .replace('ё', 'е')
                .replaceAll("[\\p{Punct}«»—–]+", " ")
                .replaceAll("\\s+", " ").trim();
        if (q.isEmpty()) return unknown();

        // These are only intent previews. No task or sharing starts automatically.
        if (q.matches(".*(создай|сделай|отправь|согласуй|утверди|измени).*(поручени|задач|платеж|цен).*")) {
            return new Result("action_preview", "Действие требует отдельного подтверждения в CRM", true);
        }
        if (q.matches(".*(трансляци|демонстраци|покажи на большой экран).*")) {
            return new Result("presentation_preview", "Демонстрация требует разрешения на принимающем экране", true);
        }

        boolean navigation = q.matches(".*(открой|перейди|покажи|выведи|вернись|расскажи|что с|как идут).*");
        if (!navigation) return unknown();

        if (q.matches(".*(триовист|21век|21 век|21vek).*")) return new Result("triovist", "Триовист / 21vek", false);
        if (q.matches(".*(продаж|выручк|оборот|план продаж).*")) return new Result("sales", "Продажи", false);
        if (q.matches(".*(пдз|задолж|дебитор|долг).*")) return new Result("debt", "ПДЗ", false);
        if (q.matches(".*(вип|vip).*")) return new Result("vip", "ВИП", false);
        if (q.matches(".*(акци|промо).*")) return new Result("promotions", "Акции", false);
        if (q.matches(".*(маршрут|визит).*")) return new Result("routes", "Маршруты", false);
        if (q.matches(".*(gps|джипиэс|геолокац).*")) return new Result("gps", "GPS", false);
        if (q.matches(".*(задач|поручени).*")) return new Result("tasks", "Задачи", false);
        if (q.matches(".*(остатк|склад|наличи).*")) return new Result("stock", "Остатки", false);
        if (q.matches(".*(клиент|покупател).*")) return new Result("clients", "Клиенты", false);
        if (q.matches(".*(главн|сводк|дашборд).*")) return new Result("dashboard", "Сводка", false);
        return unknown();
    }

    private static Result unknown() {
        return new Result("unknown", "Команда не распознана — ничего не выполнено", false);
    }
}
