package by.resanta.air3probe;

public final class VoiceNavigationTest {
    private static void expect(String phrase, String expected) {
        VoiceNavigation.Result value = VoiceNavigation.resolve(phrase);
        if (!expected.equals(value.action)) {
            throw new AssertionError("Phrase " + phrase + ": expected " + expected + ", got " + value.action);
        }
    }

    public static void main(String[] args) {
        expect("Привет, Ресанта, открой продажи", "sales");
        expect("Перейди в раздел ПДЗ", "debt");
        expect("Покажи Триовист", "triovist");
        expect("Открой Акции", "promotions");
        expect("Покажи VIP", "vip");
        expect("Открой маршруты", "routes");
        expect("Открой GPS", "gps");
        expect("Покажи задачи", "tasks");
        expect("Открой остатки", "stock");
        expect("Открой клиентов", "clients");
        expect("Открой сводку", "dashboard");
        expect("Создай поручение для менеджера", "action_preview");
        expect("Включи трансляцию на большой экран", "presentation_preview");
        expect("Пожалуйста купи товар", "unknown");
        expect("Я хочу изменить скидку", "action_preview");
        expect("Погода в Москве", "unknown");
        VoiceNavigation.Result write = VoiceNavigation.resolve("Создай поручение");
        if (!write.requiresConfirmation) throw new AssertionError("Writes need confirmation");
        VoiceNavigation.Result presentation = VoiceNavigation.resolve("Включи трансляцию");
        if (!presentation.requiresConfirmation) throw new AssertionError("Projection needs consent");
        System.out.println("AIR3 v2 navigation intent preview tests passed");
    }
}
