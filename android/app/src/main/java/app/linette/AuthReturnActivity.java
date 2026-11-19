package app.linette;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;

// The way back from Google's sign-in. Google refuses its sign-in page inside
// an app's WebView, so the site opens it in a Chrome tab (@capacitor/browser).
// Supabase then returns to https://linette.app/auth/app-return, which answers
// with an intent link pinned to this app's package: Android opens
// app.linette://auth/callback?code=… here and in no other app
// (src/lib/app-google-sign-in.ts says why no custom scheme may reach Supabase).
//
// The link can't go to MainActivity directly: it is singleTop (see
// AndroidManifest.xml, for Google Play purchases), and with the Chrome tab
// above it Android would start a second copy of the app on top. This screen
// shows nothing: it hands the link to the existing MainActivity with
// CLEAR_TOP, which closes the Chrome tab and the browser plugin's own screen
// above it, and SINGLE_TOP, which gives the link to that same screen
// (onNewIntent). Capacitor's App plugin then passes it to the site as
// "appUrlOpen", and the site finishes the sign-in on its /auth/callback.
public class AuthReturnActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Intent back = new Intent(this, MainActivity.class);
        back.setAction(Intent.ACTION_VIEW);
        back.setData(getIntent().getData());
        back.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        startActivity(back);
        finish();
    }
}
