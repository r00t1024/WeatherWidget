# Samsung Weather Widget
Node.js replacement for the old Samsung Weather Widget. It was tested on a Samsung Galaxy Core (GT-I8260, Android 4.1.2).

You need to modify your stock APK:
- Copy and make a backup of `AccuweatherWidget_Main.apk` and `AccuweatherWidget_Main.odex` from `/system/app` to your PC using `adb`;
- Disassemble the ODEX file following the instructions [here](https://github.com/JesusFreke/smali/wiki/DeodexInstructions) (v1.4.0+);
- Open `AccuWeatherUrlManager.smali` with a text editor, and replace every string matching `samsungmobile.accu-weather.com` with your server's address. You may need to replace all HTTPS calls to HTTP, especially on old Android versions;
- Disassemble the APK file using APKTool;
- Inside the disassembled APK, create a directory named `smali`, and copy the disassembled ODEX files inside. You should have a `com` directory inside `smali`;
- Assemble the APK with APKTool;
- Replace `AccuweatherWidget_Main.apk` in `/system/app` with your modified APK, and delete `AccuweatherWidget_Main.odex`;
- Reboot your device.

TODOs:
- Make the map work;
- Make the daemon and live wallpaper work.
