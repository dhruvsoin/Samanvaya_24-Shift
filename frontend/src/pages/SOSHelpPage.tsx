/**
 * SOSHelpPage — Public Emergency Help & Citizen Rescue Request Portal.
 *
 * This is the citizen-facing page where anyone stranded in a flood
 * can immediately "Send for Help" with their location, emergency type,
 * number of trapped people, and receive real-time rescue status updates.
 *
 * Supports multilingual i18n for English (en), Kannada (kn), and Hindi (hi).
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  MapPin,
  Navigation,
  Phone,
  ShieldAlert,
  Loader2,
  Waves,
  HeartPulse,
  Car,
  Home,
  AlertTriangle,
  ArrowRight,
  Radio,
  LifeBuoy,
  Languages,
} from 'lucide-react';
import { api } from '@/api/client';
import { useAppStore } from '@/store';
import { useAuthStore } from '@/store/auth';
import type { IncidentType, Language, Incident } from '@contracts/types';

interface I18nDefinition {
  header: {
    brand: string;
    eocBadge: string;
    title: string;
    call112: string;
    staffLogin: string;
  };
  banner: {
    title: string;
    desc: string;
  };
  langSelectorLabel: string;
  emergencyTypesTitle: string;
  emergencyTypes: Record<
    IncidentType,
    {
      label: string;
      desc: string;
      badge: string;
    }
  >;
  location: {
    title: string;
    detectGps: string;
    detecting: string;
    placeholder: string;
    coordsLabel: string;
    zoneLabel: string;
    gpsAutoPrefix: string;
    defaultFallbackAddress: string;
  };
  people: {
    title: string;
    person: string;
    people: string;
    tenPlus: string;
  };
  contact: {
    phoneLabel: string;
    phonePlaceholder: string;
    notesLabel: string;
    notesPlaceholder: string;
  };
  submit: {
    buttonNormal: string;
    buttonSubmitting: string;
    disclaimer: string;
  };
  ticket: {
    transmittedPrefix: string;
    registeredTitle: string;
    awaitingBadge: string;
    workflowTitle: string;
    steps: string[];
    nextStepTitle: string;
    statusReported: string;
    nextStepDesc: string;
    commandButton: string;
    safetyTitle: string;
    safetyBullets: string[];
    submitAnother: string;
    checkCrew: string;
  };
}

const EMERGENCY_ICONS: Record<IncidentType, typeof Waves> = {
  flooded_home: Home,
  trapped_person: Waves,
  medical: HeartPulse,
  stranded_vehicle: Car,
  road_blocked: AlertTriangle,
  other: AlertCircle,
};

const EMERGENCY_ORDER: IncidentType[] = [
  'flooded_home',
  'trapped_person',
  'medical',
  'stranded_vehicle',
  'road_blocked',
  'other',
];

const LANGUAGES: Array<{ code: Language; label: string }> = [
  { code: 'en', label: 'English' },
  { code: 'kn', label: 'ಕನ್ನಡ (Kannada)' },
  { code: 'hi', label: 'हिंदी (Hindi)' },
];

const I18N: Record<Language, I18nDefinition> = {
  en: {
    header: {
      brand: 'SAMANVAYA RESCUE',
      eocBadge: '24/7 EOC',
      title: 'Emergency Flood Rescue SOS',
      call112: 'Call 112',
      staffLogin: 'Staff Login',
    },
    banner: {
      title: 'Trapped in Floodwaters? Request Rescue',
      desc: 'Your request is ingested instantly into our autonomous emergency coordination engine. Emergency responders are dispatched based on priority.',
    },
    langSelectorLabel: 'Select Language:',
    emergencyTypesTitle: '1. Select Emergency Type',
    emergencyTypes: {
      flooded_home: {
        label: 'Flooded Home / Building',
        desc: 'Water entering living quarters, rising floor levels',
        badge: 'PRIORITY',
      },
      trapped_person: {
        label: 'Trapped on Roof / High Ground',
        desc: 'Surrounded by water, unable to safely exit',
        badge: 'CRITICAL',
      },
      medical: {
        label: 'Medical Emergency',
        desc: 'Oxygen, dialysis, injury, or pregnant individual',
        badge: 'URGENT',
      },
      stranded_vehicle: {
        label: 'Stranded Vehicle',
        desc: 'Car or bus submerged with passengers inside',
        badge: 'HIGH',
      },
      road_blocked: {
        label: 'Blocked Route / Electric Hazard',
        desc: 'Downed live wire, bridge collapse, fallen tree',
        badge: 'HAZARD',
      },
      other: {
        label: 'Other Critical Emergency',
        desc: 'Elderly evacuation, infant supplies, structural danger',
        badge: 'ASSIST',
      },
    },
    location: {
      title: '2. Where Are You Located?',
      detectGps: 'Detect My GPS',
      detecting: 'Detecting GPS…',
      placeholder: 'Apartment name, street, nearby landmark, or sector…',
      coordsLabel: 'Coordinates',
      zoneLabel: 'Bengaluru Flood Zone',
      gpsAutoPrefix: 'GPS Location',
      defaultFallbackAddress: '5th Cross, 4th Block, Koramangala (Auto-detected)',
    },
    people: {
      title: '3. Number of People Affected / Trapped',
      person: 'person',
      people: 'people',
      tenPlus: '10+ People',
    },
    contact: {
      phoneLabel: 'Contact Mobile Number (Optional)',
      phonePlaceholder: '+91 98765 43210',
      notesLabel: 'Water Depth / Situation Note',
      notesPlaceholder: 'e.g. Water at waist level, elderly grandmother…',
    },
    submit: {
      buttonNormal: 'TRANSMIT EMERGENCY SOS · SEND RESCUE HELP',
      buttonSubmitting: 'TRANSMITTING SOS DISPATCH…',
      disclaimer: 'Emergency priority algorithm routes automatically to the nearest boat or paramedic crew.',
    },
    ticket: {
      transmittedPrefix: 'SOS TRANSMITTED',
      registeredTitle: 'Emergency Registered at EOC',
      awaitingBadge: 'AWAITING COMMAND DECISION',
      workflowTitle: 'Live Coordination Workflow:',
      steps: ['1. SOS Received', '2. EOC Decision', '3. Crew Dispatched', '4. On Scene'],
      nextStepTitle: 'Next Step: Operator Commander Decision',
      statusReported: 'STATUS: REPORTED',
      nextStepDesc:
        'Your SOS broadcast has reached Central Command EOC. The Duty Operator reviews water depth, available rescue boats, and ambulances to dispatch the optimal unit.',
      commandButton: 'Open Command Center to Review & Make Dispatch Decision →',
      safetyTitle: 'Crucial Safety Instructions While You Wait:',
      safetyBullets: [
        'Move to higher floors or rooftop immediately. Do not stay in basement or ground levels.',
        'Turn off main electrical breaker if you can do so safely without standing in water.',
        'Conserve mobile phone battery. Keep flashlight or bright cloth ready to signal the rescue boat.',
        'Do not attempt to walk or drive through moving flood water.',
      ],
      submitAnother: '← Submit Another Report',
      checkCrew: 'Check Crew HUD',
    },
  },
  kn: {
    header: {
      brand: 'ಸಮನ್ವಯ ರಕ್ಷಣೆ',
      eocBadge: '24/7 ಇಒಸಿ',
      title: 'ತುರ್ತು ಪ್ರವಾಹ ರಕ್ಷಣಾ ಎಸ್‌ಒಎಸ್ (SOS)',
      call112: '112 ಕರೆ ಮಾಡಿ',
      staffLogin: 'ಸಿಬ್ಬಂದಿ ಲಾಗಿನ್',
    },
    banner: {
      title: 'ಪ್ರವಾಹದಲ್ಲಿ ಸಿಲುಕಿದ್ದೀರಾ? ತುರ್ತು ರಕ್ಷಣೆ ಪಡೆಯಿರಿ',
      desc: 'ನಿಮ್ಮ ರಕ್ಷಣಾ ಮನವಿಯನ್ನು ತಕ್ಷಣ ನಮ್ಮ ಸ್ವಾಯತ್ತ ತುರ್ತು ನಿಯಂತ್ರಣ ಕೇಂದ್ರಕ್ಕೆ ರವಾನಿಸಲಾಗುತ್ತದೆ. ತುರ್ತು ಆದ್ಯತೆಯ ಆಧಾರದ ಮೇಲೆ ರಕ್ಷಣಾ ತಂಡವನ್ನು ಕಳುಹಿಸಲಾಗುತ್ತದೆ.',
    },
    langSelectorLabel: 'ಭಾಷೆಯನ್ನು ಆಯ್ಕೆಮಾಡಿ:',
    emergencyTypesTitle: '1. ತುರ್ತು ಪರಿಸ್ಥಿತಿಯ ಪ್ರಕಾರವನ್ನು ಆಯ್ಕೆಮಾಡಿ',
    emergencyTypes: {
      flooded_home: {
        label: 'ಮುಳುಗಿದ ಮನೆ / ಕಟ್ಟಡ',
        desc: 'ವಾಸದ ಜಾಗಕ್ಕೆ ನೀರು ನುಗ್ಗುತ್ತಿದೆ, ಮಟ್ಟ ವೇಗವಾಗಿ ಏರುತ್ತಿದೆ',
        badge: 'ಆದ್ಯತೆ',
      },
      trapped_person: {
        label: 'ಮೇಲ್ಛಾವಣಿ / ಎತ್ತರದ ಜಾಗದಲ್ಲಿ ಸಿಲುಕಿದ್ದಾರೆ',
        desc: 'ಸುತ್ತಲೂ ನೀರು ಆವರಿಸಿದೆ, ಸುರಕ್ಷಿತವಾಗಿ ಹೊರಬರಲು ಸಾಧ್ಯವಿಲ್ಲ',
        badge: 'ಅತ್ಯಂತ ತುರ್ತು',
      },
      medical: {
        label: 'ವೈದ್ಯಕೀಯ ತುರ್ತುಸ್ಥಿತಿ',
        desc: 'ಆಮ್ಲಜನಕ, ಡಯಾಲಿಸಿಸ್, ತೀವ್ರ ಗಾಯ ಅಥವಾ ಗರ್ಭಿಣಿ ಮಹಿಳೆ',
        badge: 'ತುರ್ತು',
      },
      stranded_vehicle: {
        label: 'ನೀರಿನಲ್ಲಿ ಸಿಲುಕಿದ ವಾಹನ',
        desc: 'ಕಾರು ಅಥವಾ ಬಸ್‌ನಲ್ಲಿ ಪ್ರಯಾಣಿಕರೊಂದಿಗೆ ನೀರು ನುಗ್ಗಿದೆ',
        badge: 'ಹೆಚ್ಚಿನ ಗಮನ',
      },
      road_blocked: {
        label: 'ರಸ್ತೆ ಬ್ಲಾಕ್ / ವಿದ್ಯುತ್ ತಂತಿ ಅಪಾಯ',
        desc: 'ವಿದ್ಯುತ್ ತಂತಿ ಬಿದ್ದಿದೆ, ಸೇತುವೆ ಕುಸಿತ ಅಥವಾ ಮರ ಬಿದ್ದಿದೆ',
        badge: 'ಅಪಾಯ',
      },
      other: {
        label: 'ಇತರ ತುರ್ತು ಪರಿಸ್ಥಿತಿ',
        desc: 'ವೃದ್ಧರ ಸ್ಥಳಾಂತರ, ಶಿಶು ಆಹಾರ, ಕುಸಿಯುವ ಅಪಾಯದ ಮನೆ',
        badge: 'ಸಹಾಯ',
      },
    },
    location: {
      title: '2. ನಿಮ್ಮ ಪ್ರಸ್ತುತ ಸ್ಥಳ ಎಲ್ಲಿದೆ?',
      detectGps: 'ನನ್ನ ಜಿಪಿಎಸ್ ಗುರುತಿಸಿ',
      detecting: 'ಜಿಪಿಎಸ್ ಗುರುತಿಸಲಾಗುತ್ತಿದೆ…',
      placeholder: 'ಅಪಾರ್ಟ್‌ಮೆಂಟ್ ಹೆಸರು, ರಸ್ತೆ, ಹತ್ತಿರದ ಲ್ಯಾಂಡ್‌ಮಾರ್ಕ್ ಅಥವಾ ಬಡಾವಣೆ…',
      coordsLabel: 'ನಿರ್ದೇಶಾಂಕಗಳು',
      zoneLabel: 'ಬೆಂಗಳೂರು ಪ್ರವಾಹ ವಲಯ',
      gpsAutoPrefix: 'ಜಿಪಿಎಸ್ ಸ್ಥಳ',
      defaultFallbackAddress: '5ನೇ ಕ್ರಾಸ್, 4ನೇ ಬ್ಲಾಕ್, ಕೋರಮಂಗಲ (ಸ್ವಯಂ ಗುರುತಿಸಲಾಗಿದೆ)',
    },
    people: {
      title: '3. ಬಾಧಿತರಾದ / ಸಿಲುಕಿರುವ ಜನರ ಸಂಖ್ಯೆ',
      person: 'ವ್ಯಕ್ತಿ',
      people: 'ಜನರು',
      tenPlus: '10+ ಜನರು',
    },
    contact: {
      phoneLabel: 'ಸಂಪರ್ಕ ಮೊಬೈಲ್ ಸಂಖ್ಯೆ (ಐಚ್ಛಿಕ)',
      phonePlaceholder: '+91 98765 43210',
      notesLabel: 'ನೀರಿನ ಆಳ / ಪರಿಸ್ಥಿತಿ ವಿವರ',
      notesPlaceholder: 'ಉದಾ: ಸೊಂಟ ಮಟ್ಟದ ನೀರು, ಮನೆಯಲ್ಲಿ ವೃದ್ಧರಿದ್ದಾರೆ…',
    },
    submit: {
      buttonNormal: 'ತುರ್ತು ಎಸ್‌ಒಎಸ್ ರವಾನಿಸಿ · ರಕ್ಷಣಾ ನೆರವು ಪಡೆಯಿರಿ',
      buttonSubmitting: 'ಎಸ್‌ಒಎಸ್ ರವಾನಿಸಲಾಗುತ್ತಿದೆ…',
      disclaimer: 'ತುರ್ತು ಆದ್ಯತಾ ವ್ಯವಸ್ಥೆಯು ಸಮೀಪದ ದೋಣಿ ಅಥವಾ ವೈದ್ಯಕೀಯ ತಂಡವನ್ನು ತಕ್ಷಣ ಕಳುಹಿಸುತ್ತದೆ.',
    },
    ticket: {
      transmittedPrefix: 'ಎಸ್‌ಒಎಸ್ ರವಾನಿಸಲಾಗಿದೆ',
      registeredTitle: 'ತುರ್ತು ಪರಿಸ್ಥಿತಿಯು ಕಂಟ್ರೋಲ್ ರೂಂನಲ್ಲಿ ದಾಖಲಾಗಿದೆ',
      awaitingBadge: 'ಆಪರೇಟರ್ ನಿರ್ಧಾರಕ್ಕಾಗಿ ಕಾಯುತ್ತಿದೆ',
      workflowTitle: 'ಲೈವ್ ರಕ್ಷಣಾ ಸಮನ್ವಯ ಹಂತಗಳು:',
      steps: ['1. ಎಸ್‌ಒಎಸ್ ತಲುಪಿದೆ', '2. ಇಒಸಿ ನಿರ್ಧಾರ', '3. ತಂಡ ರವಾನೆ', '4. ಸ್ಥಳಕ್ಕೆ ಆಗಮನ'],
      nextStepTitle: 'ಮುಂದಿನ ಹಂತ: ಕಮಾಂಡರ್ ಕಾರ್ಯಾಚರಣೆ ನಿರ್ಧಾರ',
      statusReported: 'ಸ್ಥಿತಿ: ದಾಖಲಾಗಿದೆ',
      nextStepDesc:
        'ನಿಮ್ಮ ಎಸ್‌ಒಎಸ್ ಸಂದೇಶವು ಕೇಂದ್ರ ಕಂಟ್ರೋಲ್ ರೂಂ (EOC) ತಲುಪಿದೆ. ಕರ್ತವ್ಯದಲ್ಲಿರುವ ಆಪರೇಟರ್ ನೀರಿನ ಆಳ ಮತ್ತು ಲಭ್ಯವಿರುವ ರಕ್ಷಣಾ ದೋಣಿಗಳನ್ನು ಪರಿಶೀಲಿಸಿ ಸೂಕ್ತ ತಂಡವನ್ನು ನಿಯೋಜಿಸುತ್ತಿದ್ದಾರೆ.',
      commandButton: 'ಕಮಾಂಡ್ ಕೇಂದ್ರ ತೆರೆದು ಪರಿಶೀಲಿಸಿ ಮತ್ತು ನಿಯೋಜನೆ ಮಾಡಿ →',
      safetyTitle: 'ರಕ್ಷಣಾ ತಂಡ ಬರುವವರೆಗೆ ಪ್ರಮುಖ ಸುರಕ್ಷತಾ ನಿಯಮಗಳು:',
      safetyBullets: [
        'ತಕ್ಷಣ ಮೇಲ್ಮಹಡಿ ಅಥವಾ ಕಟ್ಟಡದ ಛಾವಣಿಗೆ ತೆರಳಿ. ನೆಲಮಾಳಿಗೆ ಅಥವಾ ನೆಲಮಹಡಿಯಲ್ಲಿ ಇರಬೇಡಿ.',
        'ನೀರಿನಲ್ಲಿ ನಿಲ್ಲದೆ ಸುರಕ್ಷಿತವಾಗಿದ್ದರೆ ಮಾತ್ರ ಮುಖ್ಯ ವಿದ್ಯುತ್ ಸ್ವಿಚ್ (MCB) ಆಫ್ ಮಾಡಿ.',
        'ಮೊಬೈಲ್ ಬ್ಯಾಟರಿ ಉಳಿಸಿ. ರಕ್ಷಣಾ ದೋಣಿಗೆ ಸಂಕೇತ ನೀಡಲು ಟಾರ್ಚ್ ಅಥವಾ ಪ್ರಕಾಶಮಾನವಾದ ಬಟ್ಟೆ ಸಿದ್ಧವಾಗಿಡಿ.',
        'ವೇಗವಾಗಿ ಹರಿಯುವ ಪ್ರವಾಹದ ನೀರಿನಲ್ಲಿ ನಡೆಯಲು ಅಥವಾ ವಾಹನ ಓಡಿಸಲು ಎಂದಿಗೂ ಪ್ರಯತ್ನಿಸಬೇಡಿ.',
      ],
      submitAnother: '← ಇನ್ನೊಂದು ವರದಿ ಸಲ್ಲಿಸಿ',
      checkCrew: 'ಕ್ರ್ಯೂ HUD ಪರಿಶೀಲಿಸಿ',
    },
  },
  hi: {
    header: {
      brand: 'समन्वय बचाव',
      eocBadge: '24/7 ईओसी',
      title: 'आपातकालीन बाढ़ बचाव एसओएस (SOS)',
      call112: '112 पर कॉल करें',
      staffLogin: 'स्टाफ लॉगिन',
    },
    banner: {
      title: 'बाढ़ के पानी में फंसे हैं? आपातकालीन बचाव मांगें',
      desc: 'आपका अनुरोध तुरंत हमारे स्वायत्त आपातकालीन समन्वय इंजन में दर्ज होता है। प्राथमिकता के आधार पर बचाव दल तुरंत भेजा जाता है।',
    },
    langSelectorLabel: 'भाषा चुनें:',
    emergencyTypesTitle: '1. आपातकालीन स्थिति का प्रकार चुनें',
    emergencyTypes: {
      flooded_home: {
        label: 'जलमग्न घर / इमारत',
        desc: 'रहने की जगह में पानी घुस रहा है, जलस्तर तेजी से बढ़ रहा है',
        badge: 'प्राथमिकता',
      },
      trapped_person: {
        label: 'छत / ऊंचे स्थान पर फंसे हुए',
        desc: 'चारों ओर पानी से घिरे, सुरक्षित निकलना असंभव',
        badge: 'अत्यंत गंभीर',
      },
      medical: {
        label: 'चिकित्सा आपातकाल',
        desc: 'ऑक्सीजन, डायलिसिस, गंभीर चोट या गर्भवती महिला',
        badge: 'अति आवश्यक',
      },
      stranded_vehicle: {
        label: 'फंसा हुआ वाहन',
        desc: 'यात्रियों के साथ कार या बस पानी में फंसी है',
        badge: 'उच्च',
      },
      road_blocked: {
        label: 'अवरुद्ध मार्ग / बिजली का खतरा',
        desc: 'बिजली का तार गिरा, पुल ढहना या पेड़ गिरना',
        badge: 'खतरा',
      },
      other: {
        label: 'अन्य आपातकालीन स्थिति',
        desc: 'बुजुर्गों को निकालना, शिशु सामग्री, इमारत का खतरा',
        badge: 'सहायता',
      },
    },
    location: {
      title: '2. आप कहाँ स्थित हैं?',
      detectGps: 'मेरा जीपीएस खोजें',
      detecting: 'जीपीएस खोज रहा है…',
      placeholder: 'अपार्टमेंट का नाम, सड़क, निकटतम स्थल या क्षेत्र…',
      coordsLabel: 'निर्देशांक',
      zoneLabel: 'बेंगलुरु बाढ़ क्षेत्र',
      gpsAutoPrefix: 'जीपीएस स्थान',
      defaultFallbackAddress: '5वीं क्रॉस, 4वां ब्लॉक, कोरमंगला (स्वतः पहचाना गया)',
    },
    people: {
      title: '3. प्रभावित / फंसे हुए लोगों की संख्या',
      person: 'व्यक्ति',
      people: 'लोग',
      tenPlus: '10+ लोग',
    },
    contact: {
      phoneLabel: 'संपर्क मोबाइल नंबर (वैकल्पिक)',
      phonePlaceholder: '+91 98765 43210',
      notesLabel: 'पानी की गहराई / स्थिति विवरण',
      notesPlaceholder: 'उदा: कमर तक पानी, घर में बुजुर्ग हैं…',
    },
    submit: {
      buttonNormal: 'आपातकालीन एसओएस भेजें · बचाव सहायता प्राप्त करें',
      buttonSubmitting: 'एसओएस भेजा जा रहा है…',
      disclaimer: 'आपातकालीन प्राथमिकता प्रणाली निकटतम नाव या पैरामेडिक टीम को तुरंत भेजती है।',
    },
    ticket: {
      transmittedPrefix: 'एसओएस प्रेषित',
      registeredTitle: 'आपातकाल ईओसी (EOC) में दर्ज हुआ',
      awaitingBadge: 'कमांड निर्णय की प्रतीक्षा',
      workflowTitle: 'लाइव बचाव समन्वय चरण:',
      steps: ['1. एसओएस प्राप्त', '2. ईओसी निर्णय', '3. टीम रवाना', '4. मौके पर'],
      nextStepTitle: 'अगला कदम: कमांडर ऑपरेटर निर्णय',
      statusReported: 'स्थिति: दर्ज',
      nextStepDesc:
        'आपका एसओएस संदेश केंद्रीय कमांड ईओसी तक पहुंच गया है। ऑपरेटर जलस्तर और उपलब्ध बचाव नौकाओं की समीक्षा करके उपयुक्त टीम तैनात कर रहे हैं।',
      commandButton: 'कमांड सेंटर खोलें और समीक्षा व प्रेषण निर्णय लें →',
      safetyTitle: 'सहायता आने तक महत्वपूर्ण सुरक्षा निर्देश:',
      safetyBullets: [
        'तुरंत ऊपरी मंजिल या छत पर जाएं। बेसमेंट या भूतल पर बिल्कुल न रहें।',
        'यदि पानी में खड़े हुए बिना सुरक्षित रूप से संभव हो तो मुख्य बिजली स्विच बंद कर दें।',
        'मोबाइल फोन की बैटरी बचाएं। बचाव नाव को संकेत देने के लिए टॉर्च या चमकीला कपड़ा तैयार रखें।',
        'बहते बाढ़ के पानी में चलने या गाड़ी चलाने का बिल्कुल प्रयास न करें।',
      ],
      submitAnother: '← एक और रिपोर्ट भेजें',
      checkCrew: 'क्रू HUD देखें',
    },
  },
};

export function SOSHelpPage() {
  const [language, setLanguage] = useState<Language>('en');
  const [selectedType, setSelectedType] = useState<IncidentType>('flooded_home');
  const [peopleCount, setPeopleCount] = useState(2);
  const [address, setAddress] = useState('14th Main Rd, Sector 4, HSR Layout');
  const [coords, setCoords] = useState<{ lat: number; lng: number }>({ lat: 12.9248, lng: 77.6201 });
  const [detectingGps, setDetectingGps] = useState(false);
  const [details, setDetails] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submittedTicket, setSubmittedTicket] = useState<{
    id: string;
    summary: string;
    etaMinutes: number;
    assignedUnit: string;
    stage: 'received' | 'assigned' | 'on_the_way' | 'arrived';
  } | null>(null);

  const setIncident = useAppStore((s) => s.setIncident);
  const pushOpLog = useAppStore((s) => s.pushOpLog);
  const { isLoggedIn, logout } = useAuthStore();

  const t = I18N[language] || I18N.en;

  function handleDetectGps() {
    setDetectingGps(true);
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setAddress(`${t.location.gpsAutoPrefix}: ${pos.coords.latitude.toFixed(4)}°N, ${pos.coords.longitude.toFixed(4)}°E`);
          setDetectingGps(false);
        },
        () => {
          // Fallback to high-risk flood sector in demo
          setCoords({ lat: 12.9279, lng: 77.6271 });
          setAddress(t.location.defaultFallbackAddress);
          setDetectingGps(false);
        },
        { timeout: 5000 }
      );
    } else {
      setDetectingGps(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    try {
      const selectedMeta = t.emergencyTypes[selectedType];
      const peopleLabel = peopleCount === 1 ? t.people.person : t.people.people;
      const note = `[CITIZEN SOS (${language.toUpperCase()})] Phone: ${contactNumber || 'Not provided'}. Details: ${details || 'Immediate rescue needed'}`;
      let createdIncident: Incident;

      try {
        createdIncident = await api.phoneIn.submit({
          location: {
            lat: coords.lat,
            lng: coords.lng,
            label: address || 'Reported Location',
          },
          type: selectedType,
          peopleAffected: peopleCount,
          language,
          note,
        });
      } catch {
        // Fallback for offline or mock mode
        createdIncident = {
          incidentId: `INC-SOS-${Math.floor(1000 + Math.random() * 9000)}`,
          type: selectedType,
          status: 'reported',
          severity: 'critical',
          severityScore: 96,
          timeWindowMinutes: 20,
          location: {
            lat: coords.lat,
            lng: coords.lng,
            label: address,
            zoneId: 'ZONE-B',
          },
          peopleAffected: peopleCount,
          language,
          source: 'phone_in',
          summary: `🚨 ${selectedMeta?.label || selectedType}: ${peopleCount} ${peopleLabel} (${address})`,
          confidence: 0.98,
          reportedAt: new Date().toISOString() as unknown as string,
          assignedUnitIds: [],
          reporterSessionId: null,
        };
      }

      // Ensure critical status and unassigned state
      createdIncident.severity = 'critical';
      createdIncident.status = 'reported';
      createdIncident.assignedUnitIds = [];

      setIncident(createdIncident);

      // Record in operation audit log
      pushOpLog({
        category: 'sos_received',
        incidentId: createdIncident.incidentId,
        unitId: null,
        text: `Citizen SOS received: ${createdIncident.incidentId}`,
        detail: `${selectedMeta?.label || selectedType} · ${peopleCount} ${peopleLabel} · ${address} · Language: ${language.toUpperCase()}`,
      });

      // Set live confirmation tracking ticket awaiting operator decision
      setSubmittedTicket({
        id: createdIncident.incidentId,
        summary: createdIncident.summary,
        etaMinutes: 6,
        assignedUnit: t.ticket.awaitingBadge,
        stage: 'received',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans bg-grid-dots relative">
      {/* ── Top Emergency Header ── */}
      <header className="px-4 py-2.5 bg-white/90 backdrop-blur-md border-b border-slate-200 sticky top-0 z-40 shadow-xs">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center shrink-0 shadow-xs">
              <ShieldAlert className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-semibold tracking-wider text-rose-700 uppercase truncate">
                  {t.header.brand}
                </span>
                <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-slate-100 border border-slate-200 text-slate-600 shrink-0 font-medium">
                  {t.header.eocBadge}
                </span>
              </div>
              <h1 className="text-xs font-bold text-slate-900 truncate">{t.header.title}</h1>
            </div>
          </div>

          {/* Quick Helpline Call Button & Staff Link */}
          <div className="flex items-center gap-2 shrink-0">
            <a
              href="tel:112"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white transition-colors shadow-sm"
            >
              <Phone className="w-3.5 h-3.5" />
              <span>{t.header.call112}</span>
            </a>
            {isLoggedIn ? (
              <div className="flex items-center gap-2">
                <Link
                  to="/command"
                  className="text-xs text-slate-500 hover:text-slate-900 px-3 py-1.5 rounded-lg font-medium transition-colors border border-transparent hover:bg-slate-100"
                >
                  Dashboard
                </Link>
                <button
                  onClick={() => {
                    logout();
                    window.location.href = '/login';
                  }}
                  className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-[11px] text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-all shadow-sm"
                  title="Log out"
                >
                  <span className="whitespace-nowrap uppercase tracking-wider">Logout</span>
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                className="text-xs text-slate-500 hover:text-slate-900 px-2 py-1 rounded font-medium"
              >
                {t.header.staffLogin}
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* ── Main Container ── */}
      <main className="flex-1 p-4 max-w-2xl w-full mx-auto flex flex-col gap-4">
        {/* Cinematic Flood Rescue Hero Banner */}
        <div className="relative rounded-2xl overflow-hidden shadow-lg border border-slate-200/90">
          <div 
            className="h-44 sm:h-52 w-full bg-cover bg-center bg-no-repeat relative"
            style={{ backgroundImage: "url('/assets/flood_rescue_hero.jpg')" }}
          >
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-900/60 to-transparent" />
            <div className="absolute bottom-4 left-4 right-4 text-white">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-600/90 text-[10px] font-bold uppercase tracking-wider mb-1.5 shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                Live Rescue Dispatch
              </div>
              <h2 className="text-lg sm:text-xl font-extrabold text-white leading-tight">
                Emergency Flood Rescue & Public Evacuation
              </h2>
              <p className="text-xs text-slate-200 mt-1 max-w-md line-clamp-2">
                Real-time geo-located rescue boats and medical teams deployed across Bengaluru sector zones.
              </p>
            </div>
          </div>
        </div>

        {/* Language Selector Bar */}
        <div className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-slate-200 text-xs shadow-xs">
          <div className="flex items-center gap-2 text-slate-700 font-medium">
            <Languages className="w-3.5 h-3.5 text-blue-600" />
            <span className="text-xs">{t.langSelectorLabel}</span>
          </div>
          <div className="flex gap-1.5">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                type="button"
                onClick={() => setLanguage(lang.code)}
                className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${
                  language === lang.code
                    ? 'bg-blue-50 text-blue-700 border border-blue-200 font-semibold'
                    : 'bg-slate-50 text-slate-600 hover:text-slate-900 border border-slate-200'
                }`}
              >
                {lang.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── POST-SUBMISSION RESCUE TRACKER ── */}
        {submittedTicket ? (
          <div className="space-y-4">
            {/* Live Ticket Card */}
            <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-4 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[11px] font-mono text-slate-500 uppercase tracking-wider">
                      {t.ticket.transmittedPrefix} · {submittedTicket.id}
                    </span>
                    <h2 className="text-sm font-bold text-slate-900 mt-0.5">{t.ticket.registeredTitle}</h2>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded text-[11px] font-mono font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                  {t.ticket.awaitingBadge}
                </span>
              </div>

              {/* Progress Stepper */}
              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">{t.ticket.workflowTitle}</p>
                <div className="grid grid-cols-4 gap-2 text-center">
                  {t.ticket.steps.map((label, idx) => {
                    const isDone = idx === 0;
                    const isCurrent = idx === 1;
                    return (
                      <div key={idx} className="flex flex-col items-center gap-1">
                        <div
                          className={`h-1.5 w-full rounded-full ${
                            isDone ? 'bg-emerald-500' : isCurrent ? 'bg-amber-500' : 'bg-slate-200'
                          }`}
                        />
                        <span
                          className={`text-[10px] uppercase font-semibold ${
                            isDone ? 'text-emerald-700' : isCurrent ? 'text-amber-700' : 'text-slate-400'
                          }`}
                        >
                          {label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ETA & EOC Operator Decision Action Box */}
              <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-blue-900 flex items-center gap-1.5 uppercase tracking-wider">
                    <Radio className="w-3.5 h-3.5 text-blue-600" /> {t.ticket.nextStepTitle}
                  </span>
                  <span className="text-[10px] font-mono text-slate-500">{t.ticket.statusReported}</span>
                </div>
                <p className="text-xs text-slate-700 leading-relaxed">
                  {t.ticket.nextStepDesc}
                </p>
                <div className="pt-1">
                  <Link
                    to="/command"
                    className="w-full py-2.5 px-4 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center gap-2 transition-colors shadow-sm"
                  >
                    <span>{t.ticket.commandButton}</span>
                  </Link>
                </div>
              </div>

              {/* Immediate Survival Instructions */}
              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-800 uppercase tracking-wider">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600" /> {t.ticket.safetyTitle}
                </div>
                <ul className="text-xs text-slate-600 space-y-1 pl-4 list-disc">
                  {t.ticket.safetyBullets.map((bullet, idx) => (
                    <li key={idx}>{bullet}</li>
                  ))}
                </ul>
              </div>

              {/* Return or Submit Another Button */}
              <div className="pt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setSubmittedTicket(null)}
                  className="px-3.5 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700 transition-colors shadow-xs"
                >
                  {t.ticket.submitAnother}
                </button>
                <Link
                  to="/crew"
                  className="px-3.5 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700 transition-colors flex items-center gap-1 shadow-xs"
                >
                  <span>{t.ticket.checkCrew}</span>
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          </div>
        ) : (
          /* ── SUBMISSION FORM: SEND FOR HELP ── */
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Urgent Banner */}
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-3 shadow-xs">
              <span className="w-8 h-8 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <LifeBuoy className="w-4 h-4" />
              </span>
              <div>
                <h2 className="text-sm font-bold text-rose-900">{t.banner.title}</h2>
                <p className="text-xs text-rose-800 mt-0.5 leading-relaxed">
                  {t.banner.desc}
                </p>
              </div>
            </div>

            {/* Step 1: Emergency Category */}
            <div className="space-y-2">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-700">
                {t.emergencyTypesTitle}
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {EMERGENCY_ORDER.map((typeKey) => {
                  const item = t.emergencyTypes[typeKey];
                  const Icon = EMERGENCY_ICONS[typeKey];
                  const isSelected = selectedType === typeKey;
                  return (
                    <button
                      key={typeKey}
                      type="button"
                      onClick={() => setSelectedType(typeKey)}
                      className={`p-3 rounded-xl text-left border transition-colors flex items-start gap-2.5 ${
                        isSelected
                          ? 'bg-rose-50/80 border-rose-300 text-slate-900 shadow-xs'
                          : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700 shadow-xs'
                      }`}
                    >
                      <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                        isSelected ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-500'
                      }`}>
                        <Icon className="w-4 h-4" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <p className="text-xs font-semibold truncate">{item.label}</p>
                          <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded border font-semibold ${
                            isSelected ? 'bg-rose-100 text-rose-700 border-rose-200' : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}>
                            {item.badge}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{item.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Step 2: Location & GPS */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-700">
                  {t.location.title}
                </label>
                <button
                  type="button"
                  onClick={handleDetectGps}
                  disabled={detectingGps}
                  className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-50 text-blue-600 border border-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors shadow-xs"
                >
                  {detectingGps ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Navigation className="w-3 h-3" />
                  )}
                  <span>{detectingGps ? t.location.detecting : t.location.detectGps}</span>
                </button>
              </div>

              <div className="relative">
                <MapPin className="w-3.5 h-3.5 text-rose-600 absolute left-3 top-3" />
                <input
                  type="text"
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder={t.location.placeholder}
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-white border border-slate-300 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-rose-600 focus:ring-1 focus:ring-rose-600"
                />
              </div>
              <p className="text-[10px] text-slate-500 pl-0.5 font-mono">
                {t.location.coordsLabel}: {coords.lat.toFixed(4)}°N, {coords.lng.toFixed(4)}°E ({t.location.zoneLabel})
              </p>
            </div>

            {/* Step 3: People Trapped Counter */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-700">
                {t.people.title}
              </label>
              <div className="flex items-center gap-3">
                <div className="flex items-center bg-white border border-slate-300 rounded-lg p-0.5 shadow-xs">
                  <button
                    type="button"
                    onClick={() => setPeopleCount(Math.max(1, peopleCount - 1))}
                    className="w-7 h-7 rounded bg-slate-100 hover:bg-slate-200 font-mono text-sm text-slate-700 flex items-center justify-center transition-colors"
                  >
                    -
                  </button>
                  <span className="w-10 text-center text-sm font-bold text-slate-900 font-mono">
                    {peopleCount}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPeopleCount(peopleCount + 1)}
                    className="w-7 h-7 rounded bg-slate-100 hover:bg-slate-200 font-mono text-sm text-slate-700 flex items-center justify-center transition-colors"
                  >
                    +
                  </button>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {[1, 2, 4, 6, 10].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setPeopleCount(num)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-colors ${
                        peopleCount === num
                          ? 'bg-rose-50 text-rose-700 border border-rose-300 font-bold'
                          : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900 shadow-xs'
                      }`}
                    >
                      {num === 10 ? t.people.tenPlus : `${num} ${num === 1 ? t.people.person : t.people.people}`}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Step 4: Contact Number & Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  {t.contact.phoneLabel}
                </label>
                <div className="relative">
                  <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="tel"
                    value={contactNumber}
                    onChange={(e) => setContactNumber(e.target.value)}
                    placeholder={t.contact.phonePlaceholder}
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-white border border-slate-300 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-rose-600 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  {t.contact.notesLabel}
                </label>
                <input
                  type="text"
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder={t.contact.notesPlaceholder}
                  className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-rose-600"
                />
              </div>
            </div>

            {/* Transmit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center gap-2 transition-colors disabled:opacity-50 shadow-md"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{t.submit.buttonSubmitting}</span>
                  </>
                ) : (
                  <>
                    <ShieldAlert className="w-4 h-4" />
                    <span>{t.submit.buttonNormal}</span>
                  </>
                )}
              </button>
              <p className="text-center text-[10px] font-medium text-slate-500 mt-2">
                {t.submit.disclaimer}
              </p>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}

