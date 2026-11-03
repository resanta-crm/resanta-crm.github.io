package by.resanta.air3;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Strict first-words only activation for the explicitly enabled AIR3 demo. */
final class DemoWakePhrase {
    private static final Pattern HELLO = Pattern.compile(
        "(?iu)^\\s*(?:(?:привет|эй|слушай)\\s*[,!—-]*\\s*)?" +
        "(?:лера|ресанта|рессанта|резанта)(?=$|[\\s,.!?:;—-])");

    static String questionAfterWake(String spoken) {
        if(spoken == null) return null;
        Matcher m = HELLO.matcher(spoken);
        if(!m.find()) return null;
        return spoken.substring(m.end()).replaceFirst("^[\\s,.!?:;—-]+","").trim();
    }

    private DemoWakePhrase() {}
}
