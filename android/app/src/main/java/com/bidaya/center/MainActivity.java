package com.bidaya.center;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BidayaPrintPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
