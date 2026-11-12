package in.builtbygsv.kamayuu;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.graphics.Insets;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle state) {
        registerPlugin(KamayuuIdentityPlugin.class);
        super.onCreate(state);
        // Keep the game clear of cutouts, system gestures and the keyboard on
        // Android versions where CSS safe-area values are not exposed by WebView.
        ViewCompat.setOnApplyWindowInsetsListener(findViewById(android.R.id.content),(view,insets)->{
            Insets safe=insets.getInsets(WindowInsetsCompat.Type.systemBars()|WindowInsetsCompat.Type.displayCutout()|WindowInsetsCompat.Type.ime());
            view.setPadding(safe.left,safe.top,safe.right,safe.bottom);
            return WindowInsetsCompat.CONSUMED;
        });
    }
}
