package com.qweensalon.app;

import android.content.Intent;
import android.os.Build;

import androidx.core.content.ContextCompat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "QweenForegroundService")
public class QweenForegroundServicePlugin extends Plugin {

  @PluginMethod
  public void start(PluginCall call) {
    try {
      Intent intent = new Intent(getContext(), QweenForegroundService.class);
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        ContextCompat.startForegroundService(getContext(), intent);
      } else {
        getContext().startService(intent);
      }
      call.resolve();
    } catch (Exception e) {
      call.reject("Failed to start foreground service", e);
    }
  }

  @PluginMethod
  public void stop(PluginCall call) {
    try {
      Intent intent = new Intent(getContext(), QweenForegroundService.class);
      getContext().stopService(intent);
      call.resolve();
    } catch (Exception e) {
      call.reject("Failed to stop foreground service", e);
    }
  }
}
