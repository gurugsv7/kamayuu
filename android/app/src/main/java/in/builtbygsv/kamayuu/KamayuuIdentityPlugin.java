package in.builtbygsv.kamayuu;

import android.content.Context;
import android.annotation.SuppressLint;
import android.content.SharedPreferences;
import android.os.CancellationSignal;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.ClearCredentialStateRequest;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.ClearCredentialException;
import androidx.credentials.exceptions.GetCredentialException;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.NoCredentialException;
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Arrays;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name="KamayuuIdentity")
// Durable writes complete on Capacitor's task thread before auth refresh or
// consent redemption resolves. An asynchronous apply could lose the new token.
@SuppressLint("ApplySharedPref")
public class KamayuuIdentityPlugin extends Plugin {
    private CancellationSignal pending;
    private static final String KEY_ALIAS="kamayuu-auth-v1";
    private SharedPreferences store(){return getContext().getSharedPreferences("kamayuu_auth",Context.MODE_PRIVATE);}
    private String storageKey(PluginCall call){
        String key=call.getString("key");
        if(key==null||!key.startsWith("lotus-guest-")||key.length()>200)throw new IllegalArgumentException("Invalid auth storage key");
        return key;
    }
    private synchronized SecretKey encryptionKey() throws Exception {
        KeyStore keys=KeyStore.getInstance("AndroidKeyStore");keys.load(null);
        if(keys.containsAlias(KEY_ALIAS))return (SecretKey)keys.getKey(KEY_ALIAS,null);
        KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build());
        return generator.generateKey();
    }
    @PluginMethod public void getItem(PluginCall call){
        try{
            String key=storageKey(call),saved=store().getString(key,null);JSObject result=new JSObject();
            if(saved==null){result.put("value",JSObject.NULL);call.resolve(result);return;}
            try{
                byte[] bytes=Base64.decode(saved,Base64.NO_WRAP);if(bytes.length<29)throw new IllegalArgumentException();
                Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,encryptionKey(),new GCMParameterSpec(128,Arrays.copyOfRange(bytes,0,12)));
                cipher.updateAAD(key.getBytes(StandardCharsets.UTF_8));
                result.put("value",new String(cipher.doFinal(Arrays.copyOfRange(bytes,12,bytes.length)),StandardCharsets.UTF_8));
            }catch(Exception invalid){store().edit().remove(key).commit();result.put("value",JSObject.NULL);}
            call.resolve(result);
        }catch(Exception error){call.reject("Could not read the saved sign-in.","STORAGE_ERROR");}
    }
    @PluginMethod public void setItem(PluginCall call){
        try{
            String key=storageKey(call),value=call.getString("value");if(value==null||value.length()>131072)throw new IllegalArgumentException();
            Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,encryptionKey());cipher.updateAAD(key.getBytes(StandardCharsets.UTF_8));
            byte[] encrypted=cipher.doFinal(value.getBytes(StandardCharsets.UTF_8)),iv=cipher.getIV(),bytes=new byte[iv.length+encrypted.length];
            System.arraycopy(iv,0,bytes,0,iv.length);System.arraycopy(encrypted,0,bytes,iv.length,encrypted.length);
            if(!store().edit().putString(key,Base64.encodeToString(bytes,Base64.NO_WRAP)).commit())throw new IllegalStateException();call.resolve();
        }catch(Exception error){call.reject("Could not save sign-in securely.","STORAGE_ERROR");}
    }
    @PluginMethod public void removeItem(PluginCall call){
        try{if(!store().edit().remove(storageKey(call)).commit())throw new IllegalStateException();call.resolve();}
        catch(Exception error){call.reject("Could not clear saved sign-in.","STORAGE_ERROR");}
    }
    @PluginMethod public void signIn(PluginCall call){
        String client=call.getString("clientId"),nonce=call.getString("nonce");
        if(client==null||!client.matches("[0-9]+-[a-z0-9]+\\.apps\\.googleusercontent\\.com")||nonce==null||!nonce.matches("[a-f0-9]{64}")){call.reject("Google sign-in is not configured.","AUTH_CONFIG");return;}
        getActivity().runOnUiThread(()->{
            if(pending!=null){call.reject("Sign-in is already open.","AUTH_BUSY");return;}
            pending=new CancellationSignal();
            GetSignInWithGoogleOption option=new GetSignInWithGoogleOption.Builder(client).setNonce(nonce).build();
            GetCredentialRequest request=new GetCredentialRequest.Builder().addCredentialOption(option).build();
            CredentialManager.create(getContext()).getCredentialAsync(getActivity(),request,pending,ContextCompat.getMainExecutor(getContext()),new CredentialManagerCallback<GetCredentialResponse,GetCredentialException>(){
                @Override public void onResult(GetCredentialResponse result){
                    pending=null;
                    try{GoogleIdTokenCredential token=GoogleIdTokenCredential.createFrom(result.getCredential().getData());JSObject data=new JSObject();data.put("idToken",token.getIdToken());call.resolve(data);}
                    catch(Exception error){call.reject("Google did not return a valid sign-in token.","AUTH_TOKEN");}
                }
                @Override public void onError(@NonNull GetCredentialException error){
                    pending=null;
                    if(error instanceof GetCredentialCancellationException)call.reject("Sign-in cancelled. You can still play offline.","AUTH_CANCELLED");
                    else if(error instanceof NoCredentialException)call.reject("No Google account is available. Add one in Android Settings or play offline.","AUTH_NO_ACCOUNT");
                    else call.reject("Google sign-in could not finish. Check the connection and Android OAuth configuration.","AUTH_FAILED");
                }
            });
        });
    }
    @PluginMethod public void clearSignIn(PluginCall call){
        CredentialManager.create(getContext()).clearCredentialStateAsync(new ClearCredentialStateRequest(),null,ContextCompat.getMainExecutor(getContext()),new CredentialManagerCallback<Void,ClearCredentialException>(){
            @Override public void onResult(Void ignored){call.resolve();}
            @Override public void onError(@NonNull ClearCredentialException error){call.resolve();}
        });
    }
    @Override protected void handleOnDestroy(){if(pending!=null){pending.cancel();pending=null;}}
}
