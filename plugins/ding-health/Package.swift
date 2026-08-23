// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "DingHealth",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "DingHealth",
            targets: ["DingHealthPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "6.0.0")
    ],
    targets: [
        .target(
            name: "DingHealthPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "ios/Sources/DingHealthPlugin")
    ]
)
