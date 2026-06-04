import React, { useState } from 'react';
import { X } from 'lucide-react';

type Tab = 'privacy' | 'terms' | 'disclaimer';

interface LegalModalProps {
  initialTab?: Tab;
  onClose: () => void;
}

// ============================================================================
//  Publisher identification
// ============================================================================
// The app is published by Cuodi Beltran operating under the trade name "Ding! Fitness"
// as a sole proprietorship. If a formal entity (LLC, Inc.) is later created,
// update PUBLISHER_LEGAL_NAME and PUBLISHER_TYPE.
const APP_NAME = 'Ding! Fitness';
const PUBLISHER_LEGAL_NAME = 'Cuodi Beltran';
const PUBLISHER_DBA = 'Ding! Fitness';
const PUBLISHER_FULL = `${PUBLISHER_LEGAL_NAME}, doing business as ${PUBLISHER_DBA}`;
const CONTACT_EMAIL = 'support@dings.fitness';
const GOVERNING_STATE = 'Florida';
const EFFECTIVE_DATE = 'May 16, 2026';

const sections: { id: Tab; label: string }[] = [
  { id: 'privacy', label: 'Privacy Policy' },
  { id: 'terms', label: 'Terms of Service' },
  { id: 'disclaimer', label: 'Health Disclaimer' },
];

export const LegalModal: React.FC<LegalModalProps> = ({ initialTab = 'privacy', onClose }) => {
  const [tab, setTab] = useState<Tab>(initialTab);

  return (
    <div
      className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.85)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full sm:max-w-lg glass rounded-t-3xl sm:rounded-3xl flex flex-col overflow-hidden"
        style={{
          maxHeight: '90vh',
          borderTop: '1px solid rgba(249,115,22,0.2)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 0 60px rgba(249,115,22,0.06)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 shrink-0">
          <span className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">{APP_NAME} · Legal</span>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex px-6 gap-1 shrink-0 mb-4">
          {sections.map(s => (
            <button
              key={s.id}
              onClick={() => setTab(s.id)}
              className={`flex-1 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${
                tab === s.id ? 'bg-orange-500 text-black' : 'text-gray-500 hover:text-white'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto px-6 pb-8 text-gray-300 text-[13px] leading-relaxed space-y-4">
          {tab === 'privacy' && <PrivacyPolicy />}
          {tab === 'terms' && <TermsOfService />}
          {tab === 'disclaimer' && <HealthDisclaimer />}
        </div>
      </div>
    </div>
  );
};

const H2: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h2 className="text-white font-bold text-sm uppercase tracking-wider mt-6 mb-2 first:mt-0">{children}</h2>
);

const P: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-gray-400">{children}</p>
);

// ============================================================================
//  Privacy Policy
// ============================================================================
function PrivacyPolicy() {
  return (
    <>
      <p className="text-[10px] text-gray-600 font-mono">Effective {EFFECTIVE_DATE}</p>
      <P>
        This Privacy Policy describes how {PUBLISHER_FULL} (&ldquo;we,&rdquo; &ldquo;us&rdquo;) collects,
        uses, and protects your information when you use the {APP_NAME} mobile and web application
        (the &ldquo;App&rdquo;).
      </P>

      <H2>Quick Summary</H2>
      <P>
        We collect the information you enter into the App (account email, body metrics, food and
        workout logs) so the App can track your progress and personalize your targets. We do not
        sell your data, do not show ads, and do not use third-party analytics or advertising
        trackers. You can delete your account and all associated data from the Profile screen at any
        time.
      </P>

      <H2>Information We Collect</H2>
      <P>
        <strong className="text-white">Account information.</strong> Your email address and a hashed
        password (managed by Firebase Authentication; we never see your plain-text password).
      </P>
      <P>
        <strong className="text-white">Profile information.</strong> Your name, age, sex (used for
        calorie calculations), height, weight, body fat percentage (optional), activity level,
        fitness goal, and an optional profile picture.
      </P>
      <P>
        <strong className="text-white">Health and fitness data.</strong> Your weight history,
        InBody scans (if entered), nutrition logs (calories, protein, carbs, fat, fiber, water),
        workout logs (exercises, sets, reps, weight), sleep hours, and other metrics you choose
        to track.
      </P>
      <P>
        <strong className="text-white">Food images.</strong> If you photograph meals for AI
        analysis, the image is sent to Google&rsquo;s Gemini API for nutritional estimation. We do
        not store these images on our servers after analysis completes.
      </P>
      <P>
        <strong className="text-white">Chat messages.</strong> Conversations with the in-app AI
        coach are processed by Google&rsquo;s Gemini API to generate responses.
      </P>

      <H2>What We Do Not Collect</H2>
      <P>
        We do not collect: your precise location (GPS), your contacts, your browsing history,
        device identifiers for advertising purposes, biometric identifiers (Face ID / Touch ID are
        handled by your device&rsquo;s operating system and never reach us), or data from other
        apps on your device. The App contains no third-party advertising SDKs and no third-party
        analytics SDKs.
      </P>

      <H2>How We Use Your Information</H2>
      <P>
        We use the information you provide solely to operate the App: storing your data so you can
        view it across sessions, calculating personalized calorie and macro targets, generating
        AI-powered nutrition and coaching responses, displaying progress over time, and providing
        customer support when you contact us.
      </P>

      <H2>Third-Party Service Providers</H2>
      <P>
        <strong className="text-white">Firebase (Google LLC)</strong> — provides authentication,
        database (Firestore), serverless functions, and hosting. Your data is stored on Google
        Cloud infrastructure in the United States and is governed additionally by Google&rsquo;s
        privacy practices.
      </P>
      <P>
        <strong className="text-white">Google Gemini API (Google LLC)</strong> — processes the text
        prompts, food images, and AI coach conversations you submit. Google may retain API inputs
        as described in their published API usage and privacy policies. Do not submit images
        containing sensitive personal information you would not want analyzed by an AI service.
      </P>
      <P>
        <strong className="text-white">Apple, Inc. and Google LLC (App Stores)</strong> — if you
        download the App from the Apple App Store or Google Play, the store provider may collect
        installation, purchase, and crash data per their respective policies. We do not control
        what the store collects.
      </P>

      <H2>Data Security</H2>
      <P>
        Data in transit between your device and our servers is encrypted using TLS. Data at rest
        on Google Cloud is encrypted using Google&rsquo;s standard server-side encryption. Each
        user&rsquo;s data is stored under their unique Firebase user ID, and our security rules
        prevent users from reading or modifying other users&rsquo; data. No system is perfectly
        secure, and we cannot guarantee absolute security; if we become aware of a breach
        affecting your data we will notify you and applicable authorities as required by law.
      </P>

      <H2>Data Retention and Deletion</H2>
      <P>
        We retain your data for as long as your account is active. You can delete your account and
        all associated data at any time from the Profile screen in the App. After you request
        deletion, your data is permanently removed from our active systems within thirty (30)
        days. Backups containing residual data may persist for up to ninety (90) days before being
        overwritten in normal rotation. To request deletion by email, contact{' '}
        <strong className="text-white">{CONTACT_EMAIL}</strong>.
      </P>

      <H2>Children&rsquo;s Privacy</H2>
      <P>
        {APP_NAME} is not directed at children under thirteen (13) years of age. We do not knowingly
        collect personal information from children under 13. Users aged 13 to 17 must have
        verifiable consent from a parent or legal guardian to create an account. If you believe a
        child under 13 has provided us information, please contact us at{' '}
        <strong className="text-white">{CONTACT_EMAIL}</strong> and we will delete the account
        promptly.
      </P>

      <H2>Your Privacy Rights</H2>
      <P>
        Depending on your jurisdiction, you may have rights to access, correct, export, or delete
        your personal information, restrict or object to certain processing, and withdraw consent
        where processing is based on consent. Residents of California (CCPA/CPRA), the European
        Economic Area, the United Kingdom (GDPR/UK GDPR), and similar jurisdictions are entitled
        to these rights. We do not sell or share personal information for cross-context behavioral
        advertising. To exercise any right, email{' '}
        <strong className="text-white">{CONTACT_EMAIL}</strong>. We will respond within the time
        required by applicable law.
      </P>

      <H2>International Users</H2>
      <P>
        The App is operated from the United States and all data is stored on Google Cloud
        infrastructure in the United States. If you use the App from outside the U.S., you consent
        to the transfer and processing of your information in the United States, which may have
        different data-protection laws than your jurisdiction.
      </P>

      <H2>Changes to This Policy</H2>
      <P>
        We may update this Privacy Policy from time to time to reflect changes in our practices or
        for legal or operational reasons. Material changes will be communicated in-app and the
        &ldquo;Effective&rdquo; date above will be updated. Continued use of the App after changes
        take effect constitutes acceptance of the revised policy.
      </P>

      <H2>Contact</H2>
      <P>
        Questions about this Privacy Policy or your data? Email{' '}
        <strong className="text-white">{CONTACT_EMAIL}</strong>.
      </P>
    </>
  );
}

// ============================================================================
//  Terms of Service
// ============================================================================
function TermsOfService() {
  return (
    <>
      <p className="text-[10px] text-gray-600 font-mono">Effective {EFFECTIVE_DATE}</p>
      <P>
        These Terms of Service (&ldquo;Terms&rdquo;) are a binding agreement between you and{' '}
        {PUBLISHER_FULL} (&ldquo;we,&rdquo; &ldquo;us&rdquo;) governing your use of the{' '}
        {APP_NAME} mobile and web application (the &ldquo;App&rdquo;). By creating an account or
        using the App, you agree to these Terms.
      </P>

      <H2>Eligibility</H2>
      <P>
        You must be at least thirteen (13) years old to use {APP_NAME}. Users aged 13 to 17 must
        have permission from a parent or legal guardian. By creating an account, you represent
        that you meet these requirements and that all information you provide is accurate.
      </P>

      <H2>Your Account</H2>
      <P>
        You are responsible for maintaining the confidentiality of your login credentials and for
        all activity that occurs under your account. Notify us immediately at{' '}
        <strong className="text-white">{CONTACT_EMAIL}</strong> if you suspect unauthorized use.
        We are not liable for losses arising from unauthorized account access caused by your
        failure to safeguard your credentials.
      </P>

      <H2>Acceptable Use</H2>
      <P>You agree not to:</P>
      <P>
        &bull; reverse-engineer, decompile, or attempt to extract source code from the App;<br />
        &bull; upload content that is illegal, infringing, harmful, or violates third-party rights;<br />
        &bull; use the App or its outputs to train competing artificial intelligence models;<br />
        &bull; attempt to circumvent rate limits, security controls, or access restrictions;<br />
        &bull; impersonate another person or misrepresent your affiliation with any person;<br />
        &bull; use the App to harass, threaten, or harm any person; or<br />
        &bull; use the App in any manner that violates applicable law.
      </P>

      <H2>Health and Fitness Information</H2>
      <P>
        {APP_NAME} is a general fitness and nutrition tracking tool. It is <strong className="text-white">
        not a medical device</strong>, not a medical service, and does not provide medical advice,
        diagnosis, or treatment. See our Health Disclaimer for full details. By using the App, you
        acknowledge and agree to the Health Disclaimer.
      </P>

      <H2>AI-Generated Content</H2>
      <P>
        The App uses third-party artificial intelligence (currently Google&rsquo;s Gemini API) to
        generate nutritional estimates, meal suggestions, coaching responses, and other content.
        AI outputs are estimates and may be inaccurate, incomplete, or unsuitable for your
        situation. You are responsible for evaluating AI-generated content before acting on it.
        Do not rely on AI nutritional estimates for medical dietary management.
      </P>

      <H2>Cost and Payments</H2>
      <P>
        {APP_NAME} is currently provided free of charge with no in-app purchases or subscriptions.
        If we introduce paid features in the future, those features will be governed by additional
        terms presented to you at the time of purchase, and we will update these Terms to reflect
        the change.
      </P>

      <H2>Your Content</H2>
      <P>
        You retain ownership of the data and content you enter into the App. By using the App you
        grant us a limited, non-exclusive, royalty-free license to store, process, and display
        that data solely as necessary to operate the App for you. We do not claim ownership of
        your fitness data, photos, or chat messages.
      </P>

      <H2>Our Intellectual Property</H2>
      <P>
        The App, including its source code, design, branding (the {APP_NAME} name and logo), and
        original content, is owned by or licensed to {PUBLISHER_LEGAL_NAME} and is protected by
        copyright, trademark, and other intellectual property laws. These Terms do not grant you
        any right to use our trademarks or branding except as needed to use the App.
      </P>

      <H2>App Store Terms</H2>
      <P>
        If you obtained the App from the Apple App Store, you acknowledge that these Terms are
        between you and {PUBLISHER_LEGAL_NAME} only, and not with Apple Inc. Apple is not
        responsible for the App or its content. Apple has no obligation to provide maintenance or
        support for the App. In the event of any failure of the App to conform to any applicable
        warranty, you may notify Apple, and Apple will refund the purchase price (if any); Apple
        has no other warranty obligation with respect to the App. Apple is a third-party
        beneficiary of these Terms and is entitled to enforce them against you. Similar
        third-party beneficiary provisions apply to Google LLC if you obtained the App from Google
        Play.
      </P>

      <H2>Disclaimer of Warranties</H2>
      <P>
        THE APP IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; WITHOUT WARRANTIES
        OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION IMPLIED WARRANTIES OF
        MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, OR ACCURACY. WE DO
        NOT WARRANT THAT THE APP WILL BE UNINTERRUPTED, ERROR-FREE, OR FREE OF HARMFUL
        COMPONENTS, OR THAT THE INFORMATION IT PROVIDES WILL BE ACCURATE OR RELIABLE.
      </P>

      <H2>Limitation of Liability</H2>
      <P>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, {PUBLISHER_LEGAL_NAME.toUpperCase()} AND ITS
        AFFILIATES SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR
        PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, DATA, USE, GOODWILL, OR OTHER INTANGIBLE
        LOSSES, ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF THE APP, INCLUDING WITHOUT
        LIMITATION ANY PHYSICAL INJURY OR HEALTH CONSEQUENCES RESULTING FROM RELIANCE ON
        NUTRITION OR EXERCISE GUIDANCE PROVIDED BY THE APP. OUR TOTAL AGGREGATE LIABILITY ARISING
        OUT OF OR RELATING TO THESE TERMS OR THE APP SHALL NOT EXCEED ONE HUNDRED U.S. DOLLARS
        (US $100) OR THE AMOUNT YOU HAVE PAID US IN THE PRECEDING TWELVE MONTHS, WHICHEVER IS
        GREATER. Some jurisdictions do not allow the exclusion of certain warranties or the
        limitation of certain damages, so some of the above may not apply to you.
      </P>

      <H2>Indemnification</H2>
      <P>
        You agree to indemnify and hold harmless {PUBLISHER_LEGAL_NAME} from any claims, damages,
        liabilities, and reasonable expenses (including attorneys&rsquo; fees) arising out of (a)
        your misuse of the App, (b) your violation of these Terms, or (c) your violation of any
        third-party right, including intellectual property or privacy rights.
      </P>

      <H2>Termination</H2>
      <P>
        You may delete your account at any time from the Profile screen. We may suspend or
        terminate your access to the App if you violate these Terms, if required by law, or if
        we discontinue the App. Provisions that by their nature should survive termination
        (including Disclaimer of Warranties, Limitation of Liability, Indemnification, and
        Governing Law) will survive.
      </P>

      <H2>Governing Law and Venue</H2>
      <P>
        These Terms are governed by the laws of the State of {GOVERNING_STATE}, U.S.A., without
        regard to its conflict-of-laws principles. You and we agree that any dispute arising out
        of or relating to these Terms or the App shall be brought exclusively in the state or
        federal courts located in {GOVERNING_STATE}, and you consent to the personal jurisdiction
        of those courts. Nothing in this section prevents either party from seeking relief in
        small-claims court for qualifying disputes.
      </P>

      <H2>Severability</H2>
      <P>
        If any provision of these Terms is held to be invalid or unenforceable, the remaining
        provisions will remain in full force and effect, and the invalid provision will be
        modified to the minimum extent necessary to make it enforceable while preserving the
        original intent.
      </P>

      <H2>Changes to These Terms</H2>
      <P>
        We may modify these Terms from time to time. Material changes will be communicated in-app
        and the &ldquo;Effective&rdquo; date above will be updated. Your continued use of the App
        after the effective date of revised Terms constitutes acceptance of those changes. If you
        do not agree to the revised Terms, you may delete your account.
      </P>

      <H2>Contact</H2>
      <P>
        Questions about these Terms? Email{' '}
        <strong className="text-white">{CONTACT_EMAIL}</strong>.
      </P>
    </>
  );
}

// ============================================================================
//  Health Disclaimer
// ============================================================================
function HealthDisclaimer() {
  return (
    <>
      <div
        className="rounded-xl p-4 mb-4"
        style={{ background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.2)' }}
      >
        <p className="text-orange-400 font-bold text-[11px] uppercase tracking-widest mb-1">Important — Read Before Use</p>
        <p className="text-gray-300 text-[12px]">
          {APP_NAME} is a fitness tracking tool, not a medical service. Always consult a qualified
          healthcare provider before starting any new diet or exercise program.
        </p>
      </div>

      <H2>Not Medical Advice</H2>
      <P>
        The calorie targets, macro recommendations, workout plans, body composition projections,
        and AI coach responses provided by {APP_NAME} are for general informational and
        motivational purposes only. They are not medical advice, diagnosis, or treatment, and they
        are not a substitute for professional medical guidance.
      </P>

      <H2>Consult a Professional</H2>
      <P>
        Before beginning any nutrition or exercise program, consult with a licensed physician,
        registered dietitian, or certified fitness professional &mdash; especially if you have or
        suspect any medical condition, are pregnant or nursing, are taking prescription
        medications, or have a history of disordered eating or body-image difficulties.
      </P>

      <H2>Calorie Safety Floors</H2>
      <P>
        {APP_NAME} enforces minimum daily calorie targets (1,500 kcal/day for males, 1,200
        kcal/day for females, or 75% of estimated maintenance, whichever is higher) to discourage
        unsafe deficits. These minimums are general safety estimates, not personalized medical
        guarantees. Your individual safe minimum may be higher and should be determined with a
        healthcare provider. The App does not replace clinical assessment of nutritional needs.
      </P>

      <H2>AI Accuracy Limitations</H2>
      <P>
        Nutritional estimates derived from food images, text descriptions, or chat messages are
        approximations generated by artificial intelligence (Google Gemini). Actual caloric and
        macronutrient content may vary significantly based on portion sizes, preparation methods,
        ingredient substitutions, and other factors. Do not rely on these estimates for medical
        dietary management of conditions such as diabetes, kidney disease, food allergies, or
        eating disorder recovery.
      </P>

      <H2>Exercise Risk</H2>
      <P>
        Physical exercise carries inherent risks including injury, cardiac events, and
        musculoskeletal strain. {APP_NAME} is not responsible for any injury sustained while
        following workout plans or advice provided by the App. Stop exercising and seek medical
        attention immediately if you experience chest pain, dizziness, shortness of breath, joint
        pain, or any unusual symptoms.
      </P>

      <H2>Weight and Body Composition</H2>
      <P>
        Body composition projections, recomposition scores, and progress estimates are based on
        general physiological models and may not reflect your individual response. Weight loss,
        muscle gain, and body-fat changes vary widely between individuals based on genetics,
        hormones, sleep, stress, training quality, food quality, and many other factors outside
        the App&rsquo;s view.
      </P>

      <H2>Eating Disorders and Disordered Eating</H2>
      <P>
        If you have a current or past eating disorder, are in recovery, or are concerned about
        your relationship with food or your body, {APP_NAME} is not appropriate for unsupervised
        use. Calorie counting and body-metric tracking can be triggering for some individuals.
        Please speak with a qualified clinician before using the App, and consider these
        resources:
      </P>
      <P>
        &bull; <strong className="text-white">National Alliance for Eating Disorders</strong> —
        Helpline 1-866-662-1235 (Mon&ndash;Fri, 9am&ndash;7pm ET).<br />
        &bull; <strong className="text-white">988 Suicide &amp; Crisis Lifeline</strong> — call or
        text 988 (U.S.) for immediate mental health support.<br />
        &bull; International users: please contact local mental health services in your country.
      </P>

      <H2>Pregnancy and Nursing</H2>
      <P>
        Calorie and macro targets generated by the App are based on general adult formulas and do
        not account for the additional nutritional needs of pregnancy or lactation. If you are
        pregnant, planning pregnancy, or nursing, follow guidance from your obstetric or pediatric
        provider rather than the App.
      </P>

      <H2>Medical Conditions and Medications</H2>
      <P>
        Certain medical conditions (including but not limited to diabetes, hypoglycemia, thyroid
        disease, kidney disease, heart disease, and hormonal disorders) and certain medications
        can significantly affect appropriate calorie, macronutrient, and exercise prescriptions.
        Do not change your diet, exercise routine, or medications based on App suggestions without
        consulting your prescribing provider.
      </P>

      <H2>Emergency Situations</H2>
      <P>
        If you are experiencing a medical emergency, call your local emergency services (911 in
        the United States) immediately. Do not rely on this App for emergency guidance.
      </P>

      <H2>Your Acknowledgment</H2>
      <P>
        By accepting the health disclaimer during onboarding and continuing to use {APP_NAME}, you
        acknowledge that you have read and understood the above, that you assume full
        responsibility for any actions you take based on App content, and that you release
        {' '}{PUBLISHER_LEGAL_NAME} from any liability arising from your use of the App to the
        maximum extent permitted by law.
      </P>
    </>
  );
}

export default LegalModal;
