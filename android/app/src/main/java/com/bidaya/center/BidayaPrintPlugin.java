package com.bidaya.center;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintManager;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "BidayaPrint")
public class BidayaPrintPlugin extends Plugin {
    @PluginMethod
    public void print(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                PrintManager manager = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                manager.print("Bidaya report", getBridge().getWebView().createPrintDocumentAdapter("Bidaya report"),
                    new PrintAttributes.Builder().build());
                call.resolve();
            } catch (Exception ignored) {
                call.reject("تعذر فتح نافذة الطباعة.");
            }
        });
    }
}
