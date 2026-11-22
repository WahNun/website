/**
 * Eine Quelle für den Wortlaut, den ein Gast im Check-in liest und annimmt (Waiver, DSGVO-Art.-9-Einwilligung,
 * SSI Responsible Diver Code, Erziehungsberechtigten-Erklärung).
 *
 * Die Check-in-Seite rendert genau diese Texte (Datei bleibt frei von Node-Imports, damit sie im Browser lädt); der Server speichert beim Absenden einen Schnappschuss samt SHA-256
 * in `waiver_acceptances` (nur anfügen, nie ändern). Damit lässt sich später beweisen, WAS jemand zu welchem Zeitpunkt
 * gelesen und akzeptiert hat.
 *
 * REGEL: Ändert sich irgendein Text hier, MUSS WAIVER_VERSION mitwandern. Der Hash wird immer mitgespeichert — zwei
 * Zeilen mit gleicher Version, aber verschiedenem Hash zeigen eine vergessene Anhebung.
 *
 * Versionshistorie:
 *   2026-10-25.1  Erste versionierte Fassung (Text unverändert aus der Check-in-Seite übernommen).
 */
export const WAIVER_VERSION = '2026-10-25.1'

export const WAIVER_SECTIONS: { title: string; body: string }[] = [
    {
      title: 'Section 1 — Non-Agency Disclosure',
      body: `I understand and agree that individual Scuba Schools International (SSI) Training Centers, Instructors, and/or Dive Professionals ("Members") are authorised to utilise various SSI educational programs and trademarks, but are licensed independent business entities. I acknowledge that these Members operate their daily businesses, courses, and logistics independently, and are not employees, agents, or direct subsidiaries of SSI International GmbH or its corporate affiliates. I understand and agree that my contracting for training services, excursions, or equipment rental is executed strictly with the local Training Center and its designated personnel, and that SSI International GmbH does not control, supervise, or oversee the day-to-day operations or choices of these independent entities.`,
    },
    {
      title: 'Section 2 — Statement of Risk (Inherent Natural Risks)',
      body: `By validating this record, I affirm my understanding that:\n\n1. Diving with compressed gases involves intrinsic physical challenges including, but not limited to: decompression sickness, gas embolism, barotraumas, hyperbaric exposures, or other specialised diving injuries that may necessitate emergency medical intervention or recompression chamber treatment.\n\n2. Open water environments present variable conditions including currents, changing visibility, marine life interactions, temperature shifts, and remote geographic locations where recompression facilities or advanced emergency medical care may be distant or delayed.\n\n3. Scuba diving is a physically demanding activity that places stress on the cardiovascular, respiratory, and circulatory systems. I declare that I am physically fit, medically clear, and possess the necessary capabilities to participate safely. I will not engage in diving operations while under the influence of alcohol, prohibited narcotics, or any prescription/over-the-counter medications contraindicated for hyperbaric environments.`,
    },
    {
      title: 'Section 3 — Equipment Responsibility',
      body: `I acknowledge that it is my personal responsibility to thoroughly inspect, test, and verify the optimal functionality of all life-support equipment utilised during this program prior to entering the water. This applies to both personal gear and equipment leased or provided by the training facility. I will notify the dive professionals and the facility immediately if any component appears compromised, damaged, or fails to function as intended. I will not enter the water with gear whose configuration or performance I have not explicitly approved.`,
    },
    {
      title: 'Section 4 — Acceptance of Risk',
      body: `In the absence of any proven breach of duty, gross negligence, or wilful omission by the designated dive professionals and training center conducting this program, I accept the legal and physical responsibilities associated with the inherent and unavoidable risks of recreational diving activities.\n\nI HAVE FULLY INFORMED MYSELF OF THE ENTIRE CONTENTS OF THIS NON-AGENCY DISCLOSURE, STATEMENT OF RISK, AND EQUIPMENT EVALUATION REQUIREMENT BY READING AND REVIEWING EACH PARAMETER PRIOR TO PROVIDING DIGITAL CONSENT.`,
    },
  ]


export const GDPR_CONSENT_TEXT = `I consent to the processing of my health and medical information provided in this form exclusively for on-site dive safety and hyperbaric operational safety purposes, in accordance with GDPR Article 9.`

export const DIVER_CODE_INTRO = `Scuba diving is an adventure activity that requires the use of specialized life support equipment in an underwater environment where humans could not otherwise exist. As with other adventure activities, scuba diving has elements of risk that cannot be totally eliminated regardless of the amount of training, care, caution or expertise. SSI believes these risks may be reduced through the SSI Diver Diamond — development of proper Knowledge, Skills, Equipment and Experience. Ultimately it is up to each individual diver to assume the inherent risk associated with scuba diving and each diver's responsibility to minimize the risk through exercising good judgment, common sense, respect and personal awareness during all diving activities.`
export const DIVER_CODE_PLEDGE = `As a Responsible Diver — I pledge to:`
export const DIVER_CODE_ITEMS: { title: string; body: string }[] = [
  { title: `DIVE COMPETENTLY`, body: `Always dive within my training, certification, experience, comfort and ability.` },
  { title: `MAINTAIN APPROPRIATE DIVER HEALTH`, body: `Including appropriate fitness, physical health and mental awareness to dive.` },
  { title: `UTILIZE A DIVE PLAN`, body: `Plan my dive and dive my plan. Listen to and follow dive briefings.` },
  { title: `BE A RESPONSIBLE DIVE PARTNER`, body: `Remain with my dive partner from start to finish of my dive. Know our plan to reunite if separated underwater.` },
  { title: `INSPECT MY DIVE EQUIPMENT`, body: `Before each dive, I will inspect my equipment and make sure everything is working properly. I will confirm my cylinder valve is completely open. When using blended gas (i.e., Enriched Air Nitrox) — I shall analyze my gas and know its limitations. I will establish proper weighting, know how to release my weights, and verify my buoyancy compensator (BC) and inflator are connected and functioning properly.` },
  { title: `DIVER AWARENESS`, body: `Monitor my cylinder pressure; making sure to surface with reserve gas and never run out of gas. Monitor my depth and time, respect no decompression limits, perform controlled ascents, safety stops, and monitor my dive partner.` },
  { title: `MAINTAIN PROFICIENT SCUBA SKILLS`, body: `I understand scuba skills and knowledge are perishable. If it has been more than six months since my last dive, I understand the importance of taking a Scuba Skills Update course. I will maintain proper buoyancy throughout my dive, ascend slowly, and breathe properly to avoid overexpansion injuries.` },
  { title: `RESPECT THE ENVIRONMENT`, body: `Be aware of currents, waves, visibility, temperature, weather, boat traffic, slippery, uneven and unstable surfaces, overhead environments, entanglements, and hazardous marine life. I understand boats are unsteady surfaces and will always use one hand to stabilize myself. I understand the importance of taking an orientation dive with a local professional when diving in unfamiliar environments. I will obey all diving and applicable regulations, statutes and codes.` },
  { title: `PLAN FOR EMERGENCIES`, body: `In addition to inspecting all of my dive equipment, I will verify my dive partner's equipment is functioning properly, configured appropriately and that I know how to remove our weights in case of an emergency. I will make sure our alternate air sources are properly secured and easily accessible in case of a low air or out of air emergency. I will know scuba hand signals and how to alert others in case of an emergency. I will have an emergency action plan in case my dive partner or I have an emergency.` },
  { title: `ACCEPT RESPONSIBILITY`, body: `I am ultimately responsible for my safety during all diving activities. Failure to comply with these responsibilities will increase my risk of serious injury or death. Accidents can happen even when all safety guidelines are followed, therefore I should obtain personal dive accident insurance.` },
]
export const DIVER_CODE_CLOSING = `I understand the importance of being a responsible diver and I pledge to abide by the SSI Responsible Diver Code. I understand failure to abide by the SSI Responsible Diver Code will jeopardize my safety and well-being.`
export const DIVER_CODE_CONSENT_TEXT = `I have read and I pledge to abide by the SSI Responsible Diver Code for all dives conducted during this program.`

export const GUARDIAN_CONSENT_TEXT = `I confirm that I am the parent or legal guardian of this minor, I consent to their participation in diving activities, and I accept full responsibility for their safety and compliance with all Azores Diving rules and regulations. *`

/** Vollständiger Wortlaut, wie er dem Gast angezeigt wurde. `minor`: Erklärung des Erziehungsberechtigten war Teil des Formulars. */
export function waiverSnapshot(minor: boolean) {
  return {
    version: WAIVER_VERSION,
    sections: WAIVER_SECTIONS,
    gdpr_art9_consent_text: GDPR_CONSENT_TEXT,
    diver_code: { intro: DIVER_CODE_INTRO, pledge: DIVER_CODE_PLEDGE, items: DIVER_CODE_ITEMS, closing: DIVER_CODE_CLOSING, consent_text: DIVER_CODE_CONSENT_TEXT },
    guardian_consent_text: minor ? GUARDIAN_CONSENT_TEXT : null,
  }
}
