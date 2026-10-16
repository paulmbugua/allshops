# ML Kit discovers these component registrars reflectively. R8 may otherwise
# retain the class name while removing its public no-argument constructor,
# producing NoSuchMethodException on optimized Play builds.
-keep class com.google.mlkit.common.internal.CommonComponentRegistrar {
    public <init>();
}
-keep class com.google.mlkit.vision.common.internal.VisionCommonRegistrar {
    public <init>();
}
-keep class com.google.mlkit.vision.barcode.internal.BarcodeRegistrar {
    public <init>();
}
-keep,allowoptimization,allowobfuscation class * implements com.google.firebase.components.ComponentRegistrar {
    public <init>();
}

# Preserve Flutter plugin entry points used by generated/reflection-based
# registration in release builds.
-keep class io.flutter.plugins.** { *; }
-keep class dev.fluttercommunity.plus.** { *; }
