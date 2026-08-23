import Foundation
import Capacitor
import HealthKit

/**
 * DingHealth — a small, read-only HealthKit bridge for Ding! Fitness.
 *
 * Deliberately minimal: it reads exactly three things the app needs and
 * nothing else — today's active energy, today's workouts, and the latest
 * body-mass sample. No writes, no background delivery, no raw sample
 * streaming. Keeping the surface tiny keeps the App Store health-data
 * review narrow and avoids ever holding data we don't display.
 *
 * iOS-only. The web/Android side is a no-op stub (see src/web.ts); the app
 * guards every call behind `Capacitor.getPlatform() === 'ios'`.
 */
@objc(DingHealthPlugin)
public class DingHealthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DingHealthPlugin"
    public let jsName = "DingHealth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getTodayActiveEnergy", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getTodayWorkouts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getLatestBodyMass", returnType: CAPPluginReturnPromise)
    ]

    private let healthStore = HKHealthStore()

    private let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    // The three read types this plugin ever touches.
    private var readTypes: Set<HKObjectType> {
        var set = Set<HKObjectType>()
        if let energy = HKObjectType.quantityType(forIdentifier: .activeEnergyBurned) { set.insert(energy) }
        if let mass = HKObjectType.quantityType(forIdentifier: .bodyMass) { set.insert(mass) }
        set.insert(HKObjectType.workoutType())
        return set
    }

    private func todayPredicate() -> NSPredicate {
        let start = Calendar.current.startOfDay(for: Date())
        return HKQuery.predicateForSamples(withStart: start, end: Date(), options: .strictStartDate)
    }

    // MARK: - isAvailable

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": HKHealthStore.isHealthDataAvailable()])
    }

    // MARK: - requestAuthorization

    @objc func requestAuthorization(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.resolve(["granted": false, "available": false])
            return
        }
        healthStore.requestAuthorization(toShare: [], read: readTypes) { success, error in
            if let error = error {
                call.reject(error.localizedDescription, nil, error)
                return
            }
            // NOTE: iOS deliberately does not reveal read-permission status,
            // so `success` only means the sheet completed. The app treats a
            // completed request as "connected" and relies on empty query
            // results when the user actually denied access.
            call.resolve(["granted": success, "available": true])
        }
    }

    // MARK: - getTodayActiveEnergy

    @objc func getTodayActiveEnergy(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable(),
              let energyType = HKObjectType.quantityType(forIdentifier: .activeEnergyBurned) else {
            call.resolve(["available": false, "kcal": NSNull()])
            return
        }
        let query = HKStatisticsQuery(
            quantityType: energyType,
            quantitySamplePredicate: todayPredicate(),
            options: .cumulativeSum
        ) { _, result, error in
            if let error = error {
                call.reject(error.localizedDescription, nil, error)
                return
            }
            let kcal = result?.sumQuantity()?.doubleValue(for: HKUnit.kilocalorie())
            call.resolve([
                "available": true,
                "kcal": kcal.map { round($0) } ?? NSNull()
            ])
        }
        healthStore.execute(query)
    }

    // MARK: - getTodayWorkouts

    @objc func getTodayWorkouts(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.resolve(["available": false, "workouts": []])
            return
        }
        let sort = [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)]
        let query = HKSampleQuery(
            sampleType: HKObjectType.workoutType(),
            predicate: todayPredicate(),
            limit: HKObjectQueryNoLimit,
            sortDescriptors: sort
        ) { [weak self] _, samples, error in
            guard let self = self else { return }
            if let error = error {
                call.reject(error.localizedDescription, nil, error)
                return
            }
            let workouts: [[String: Any]] = (samples as? [HKWorkout] ?? []).map { w in
                let kcal = w.totalEnergyBurned?.doubleValue(for: HKUnit.kilocalorie())
                return [
                    "uuid": w.uuid.uuidString,
                    "activityType": self.activityName(w.workoutActivityType),
                    "activityTypeRaw": Int(w.workoutActivityType.rawValue),
                    "durationMin": round(w.duration / 60.0),
                    "kcal": kcal.map { round($0) } ?? NSNull(),
                    "start": self.iso.string(from: w.startDate),
                    "end": self.iso.string(from: w.endDate)
                ]
            }
            call.resolve(["available": true, "workouts": workouts])
        }
        healthStore.execute(query)
    }

    // MARK: - getLatestBodyMass

    @objc func getLatestBodyMass(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable(),
              let massType = HKObjectType.quantityType(forIdentifier: .bodyMass) else {
            call.resolve(["available": false, "found": false])
            return
        }
        let sort = [NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)]
        let query = HKSampleQuery(
            sampleType: massType,
            predicate: nil,
            limit: 1,
            sortDescriptors: sort
        ) { [weak self] _, samples, error in
            guard let self = self else { return }
            if let error = error {
                call.reject(error.localizedDescription, nil, error)
                return
            }
            guard let sample = samples?.first as? HKQuantitySample else {
                call.resolve(["available": true, "found": false])
                return
            }
            let kg = sample.quantity.doubleValue(for: HKUnit.gramUnit(with: .kilo))
            call.resolve([
                "available": true,
                "found": true,
                "kg": kg,
                "lbs": kg * 2.20462,
                "date": self.iso.string(from: sample.endDate),
                "uuid": sample.uuid.uuidString
            ])
        }
        healthStore.execute(query)
    }

    // MARK: - Helpers

    /// Human-readable name for the subset of workout types the app is likely
    /// to encounter. Anything unmapped falls back to "Workout" — the raw
    /// value is also returned so the JS side can refine if needed.
    private func activityName(_ type: HKWorkoutActivityType) -> String {
        switch type {
        case .running: return "Running"
        case .walking: return "Walking"
        case .cycling: return "Cycling"
        case .traditionalStrengthTraining: return "Strength Training"
        case .functionalStrengthTraining: return "Functional Strength"
        case .highIntensityIntervalTraining: return "HIIT"
        case .coreTraining: return "Core Training"
        case .elliptical: return "Elliptical"
        case .rowing: return "Rowing"
        case .swimming: return "Swimming"
        case .yoga: return "Yoga"
        case .pilates: return "Pilates"
        case .hiking: return "Hiking"
        case .stairClimbing: return "Stair Climbing"
        case .crossTraining: return "Cross Training"
        case .mixedCardio: return "Cardio"
        case .flexibility: return "Stretching"
        default: return "Workout"
        }
    }
}
