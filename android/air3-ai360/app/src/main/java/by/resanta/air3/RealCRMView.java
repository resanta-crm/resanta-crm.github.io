package by.resanta.air3;

import android.app.Activity;
import android.graphics.Color;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebStorage;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.graphics.drawable.GradientDrawable;

/**
 * Displays the ORIGINAL production RESANTA CRM on AIR3. No replicated dashboard,
 * no server data is rendered by this view. Owner signs into the real site in
 * the isolated WebView before handing the glasses to the boss.
 * No JS bridge, password forwarding or CRM JWT injection from the native pair.
 */
final class RealCRMView extends FrameLayout {
    private static final String CRM_URL = "https://resanta-crm.by/index.html";
    private static final String CRM_HOST = "resanta-crm.by";
    private final WebView web;
    private final TextView status;
    private final Button voice;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean closed = false;
    private boolean siteReady = false;
    private final Runnable onStartVoice;
    private final Runnable onEndSession;

    RealCRMView(Activity activity, Runnable onStartVoice, Runnable onEndSession) {
        super(activity);
        this.onStartVoice = onStartVoice;
        this.onEndSession = onEndSession;
        setBackgroundColor(Color.rgb(7,26,53));
        web = new WebView(activity);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);   // Required by the original CRM.
        settings.setDomStorageEnabled(true);   // The site's own Supabase login.
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setMediaPlaybackRequiresUserGesture(true);
        web.setSaveEnabled(false);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request){
                Uri url=request.getUrl();
                if(!request.isForMainFrame())return false;
                if(url!=null && "https".equalsIgnoreCase(url.getScheme())
                    && CRM_HOST.equalsIgnoreCase(url.getHost()))return false;
                if(status!=null)status.setText("Переход наружу из CRM заблокирован");
                return true;
            }
            @Override public void onPageFinished(WebView view,String url){
                super.onPageFinished(view,url);
                inspectCrmLoaded();
            }
        });
        addView(web,new FrameLayout.LayoutParams(-1,-1));

        LinearLayout bar = new LinearLayout(activity);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(8,4,8,4);
        bar.setBackgroundColor(Color.rgb(8,34,60));
        voice = new Button(activity);
        voice.setText("🎙 Привет, Лера");
        voice.setAllCaps(false);
        voice.setTextSize(13);
        voice.setMinHeight(46);
        voice.setOnClickListener(v->onStartVoice.run());
        bar.addView(voice,new LinearLayout.LayoutParams(0,-2,1f));
        Button end = new Button(activity);
        end.setText("Завершить");
        end.setAllCaps(false);
        end.setTextSize(12);
        end.setMinHeight(46);
        end.setOnClickListener(v->onEndSession.run());
        bar.addView(end,new LinearLayout.LayoutParams(-2,-2));
        FrameLayout.LayoutParams top=new FrameLayout.LayoutParams(-1,-2,Gravity.TOP);
        addView(bar,top);

        status = new TextView(activity);
        status.setText("Загружаю настоящую РЕСАНТА CRM. Войди в сайт до передачи очков.");
        status.setTextSize(13);
        status.setTextColor(Color.WHITE);
        status.setMaxLines(3);
        status.setPadding(12,8,12,8);
        status.setBackgroundColor(Color.rgb(8,34,60));
        FrameLayout.LayoutParams bottom=new FrameLayout.LayoutParams(-1,-2,Gravity.BOTTOM);
        addView(status,bottom);
        web.loadUrl(CRM_URL);
        handler.postDelayed(this::inspectCrmLoaded,2200);
    }

    void setVoiceActive(boolean enabled){
        if(closed)return;
        voice.setText(enabled?"■ Остановить показ":"🎙 Привет, Лера");
    }

    void showStatus(String message){
        if(closed)return;
        String value=message==null?"":message.replaceAll("\\s+"," ").trim();
        status.setText(value.length()>210?value.substring(0,210)+"…":value);
    }

    void inspectCrmLoaded(){
        if(closed)return;
        web.evaluateJavascript(
          "(function(){var b=document.getElementById('nav-sales');" +
          "if(!b)return 'loading';for(var p=b;p;p=p.parentElement){" +
          "if(p.nodeType===1&&(getComputedStyle(p).display==='none'||" +
          "getComputedStyle(p).visibility==='hidden'))return 'login';}" +
          "return 'ready';})()", raw->{
            if(closed)return;
            siteReady="\"ready\"".equals(raw);
            if(siteReady)showStatus("Открыта настоящая CRM. Скажи «Привет, Лера».");
            else if(!siteReady)handler.postDelayed(this::inspectCrmLoaded,3200);
          });
    }

    boolean isSiteReady(){return siteReady;}

    /** Click a real CRM nav button, only if the web session and menu allow it. */
    void navigate(String domain){
        if(closed||!siteReady)return;
        final String id;
        switch(domain){
            case "sales":id="nav-sales";break;
            case "debt":id="nav-debt";break;
            case "operations":id="nav-dashboard";break;
            case "triovist":id="nav-triovist";break;
            case "vip":id="nav-vip";break;
            case "promotions":id="nav-promotions";break;
            case "clients":id="nav-clients";break;
            case "routes":id="nav-routes-boss";break;
            case "stock":id="nav-warehouse-control";break;
            case "tasks":id="nav-tasks";break;
            default:return;
        }
        final String script="(function(){var b=document.getElementById('"+id+"');"+
            "if(!b||b.disabled||b.getAttribute('aria-disabled')==='true')return 'unavailable';"+
            "for(var p=b;p;p=p.parentElement){if(p.nodeType===1&&(getComputedStyle(p).display==='none'"+
            "||getComputedStyle(p).visibility==='hidden'))return 'hidden';}"+
            "b.click();return 'clicked';})()";
        web.evaluateJavascript(script, ignored->{});
    }

    /** Revokes locally persisted website login; delegated AI token is handled separately. */
    void closePrivateWebsite(){
        if(closed)return;
        closed=true;
        siteReady=false;
        handler.removeCallbacksAndMessages(null);
        try{web.stopLoading();web.loadUrl("about:blank");web.clearHistory();web.clearCache(true);
            web.removeAllViews();web.destroy();}catch(Exception ignored){}
        try{WebStorage.getInstance().deleteAllData();}catch(Exception ignored){}
        try{CookieManager.getInstance().removeAllCookies(null);
            CookieManager.getInstance().flush();}catch(Exception ignored){}
    }
}
