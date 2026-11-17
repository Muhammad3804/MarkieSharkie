// Mock venue data until the venues API exists.
// - landingSections: the landing page rows, copied from the Figma design (file zEl0W4jI3xx9Gm2L8eKVan, node 1:3),
//   shaped like the future GET /api/venues/landing response (camelCase, money as a string).
// - getMockVenue(id): the full venue for the detail page, shaped like GET /api/venues/:id (see the builder at the
//   bottom). Read through api/venues.js, never import this from pages directly.
import { AMENITIES, EVENT_LABELS, GALLERY_SECTIONS } from './constants.js'
import gallery1Img from '../../assets/venue-detail/gallery-1.webp'
import gallery2Img from '../../assets/venue-detail/gallery-2.webp'
import gallery3Img from '../../assets/venue-detail/gallery-3.webp'
import gallery4Img from '../../assets/venue-detail/gallery-4.webp'
import gallery5Img from '../../assets/venue-detail/gallery-5.webp'
import floorplan1Img from '../../assets/venue-detail/floorplan-1.webp'
import floorplan2Img from '../../assets/venue-detail/floorplan-2.webp'
import floorplan3Img from '../../assets/venue-detail/floorplan-3.webp'
import tour1Img from '../../assets/gallery/tour-1.webp'
import hall1Img from '../../assets/gallery/hall-1.webp'
import hall2Img from '../../assets/gallery/hall-2.webp'
import hall3Img from '../../assets/gallery/hall-3.webp'
import hall4Img from '../../assets/gallery/hall-4.webp'
import stage1Img from '../../assets/gallery/stage-1.webp'
import stage2Img from '../../assets/gallery/stage-2.webp'
import stage3Img from '../../assets/gallery/stage-3.webp'
import stage4Img from '../../assets/gallery/stage-4.webp'
import bridal1Img from '../../assets/gallery/bridal-1.webp'
import bridal2Img from '../../assets/gallery/bridal-2.webp'
import bridal3Img from '../../assets/gallery/bridal-3.webp'
import bridal4Img from '../../assets/gallery/bridal-4.webp'
import bathroom1Img from '../../assets/gallery/bathroom-1.webp'
import bathroom2Img from '../../assets/gallery/bathroom-2.webp'
import bathroom3Img from '../../assets/gallery/bathroom-3.webp'
import bathroom4Img from '../../assets/gallery/bathroom-4.webp'
import parking1Img from '../../assets/gallery/parking-1.webp'
import parking2Img from '../../assets/gallery/parking-2.webp'
import parking3Img from '../../assets/gallery/parking-3.webp'
import parking4Img from '../../assets/gallery/parking-4.webp'
import entrance1Img from '../../assets/gallery/entrance-1.webp'
import entrance2Img from '../../assets/gallery/entrance-2.webp'
import entrance3Img from '../../assets/gallery/entrance-3.webp'
import entrance4Img from '../../assets/gallery/entrance-4.webp'
import hallway1Img from '../../assets/gallery/hallway-1.webp'
import hallway2Img from '../../assets/gallery/hallway-2.webp'
import hallway3Img from '../../assets/gallery/hallway-3.webp'
import hallway4Img from '../../assets/gallery/hallway-4.webp'
import qasarENoorImg from '../../assets/venues/qasar-e-noor.webp'
import thePalmsMarqueeImg from '../../assets/venues/the-palms-marquee.webp'
import rosewoodBanquetImg from '../../assets/venues/rosewood-banquet.webp'
import jasmineGardenImg from '../../assets/venues/jasmine-garden.webp'
import pearlBanquetImg from '../../assets/venues/pearl-banquet.webp'
import imperialManorImg from '../../assets/venues/imperial-manor.webp'
import heritagePalaceImg from '../../assets/venues/heritage-palace.webp'
import libertyGrandMarqueeImg from '../../assets/venues/liberty-grand-marquee.webp'
import opalPavilionImg from '../../assets/venues/opal-pavilion.webp'
import azureMarqueeImg from '../../assets/venues/azure-marquee.webp'
import royalHallImg from '../../assets/venues/royal-hall.webp'
import heritageCourtImg from '../../assets/venues/heritage-court.webp'
import cedarCourtyardImg from '../../assets/venues/cedar-courtyard.webp'
import saffronPalaceImg from '../../assets/venues/saffron-palace.webp'
import ivoryMarqueeImg from '../../assets/venues/ivory-marquee.webp'
import oliveBanquetImg from '../../assets/venues/olive-banquet.webp'
import amberGardensImg from '../../assets/venues/amber-gardens.webp'
import juniperHallImg from '../../assets/venues/juniper-hall.webp'
import lotusPavilionImg from '../../assets/venues/lotus-pavilion.webp'
import velvetCourtImg from '../../assets/venues/velvet-court.webp'
import sapphireHallImg from '../../assets/venues/sapphire-hall.webp'
import magnoliaManorImg from '../../assets/venues/magnolia-manor.webp'
import crystalGardensImg from '../../assets/venues/crystal-gardens.webp'
import orchidBanquetImg from '../../assets/venues/orchid-banquet.webp'
import emeraldMarqueeImg from '../../assets/venues/emerald-marquee.webp'
import regalPavilionImg from '../../assets/venues/regal-pavilion.webp'
import mapleCourtyardImg from '../../assets/venues/maple-courtyard.webp'
import tulipPalaceImg from '../../assets/venues/tulip-palace.webp'
import willowGardensImg from '../../assets/venues/willow-gardens.webp'
import silverHallImg from '../../assets/venues/silver-hall.webp'
import islamabadGrandImg from '../../assets/venues/islamabad-grand.webp'
import margallaMarqueeImg from '../../assets/venues/margalla-marquee.webp'
import blueAreaBanquetImg from '../../assets/venues/blue-area-banquet.webp'
import grandTerraceImg from '../../assets/venues/grand-terrace.webp'
import auroraBanquetImg from '../../assets/venues/aurora-banquet.webp'
import copperPavilionImg from '../../assets/venues/copper-pavilion.webp'
import chenabPalaceImg from '../../assets/venues/chenab-palace.webp'
import sargodhaRoadMarqueeImg from '../../assets/venues/sargodha-road-marquee.webp'
import canalViewBanquetImg from '../../assets/venues/canal-view-banquet.webp'
import blossomCourtImg from '../../assets/venues/blossom-court.webp'
import gardeniaHallImg from '../../assets/venues/gardenia-hall.webp'
import sterlingManorImg from '../../assets/venues/sterling-manor.webp'
import sunsetMarqueeImg from '../../assets/venues/sunset-marquee.webp'
import vistaPalaceImg from '../../assets/venues/vista-palace.webp'
import oakBanquetImg from '../../assets/venues/oak-banquet.webp'
import dahliaGardensImg from '../../assets/venues/dahlia-gardens.webp'
import celestialHallImg from '../../assets/venues/celestial-hall.webp'
import crownPavilionImg from '../../assets/venues/crown-pavilion.webp'

export const landingSections = [
  {
    id: 'featured',
    title: 'Featured',
    venues: [
      {
        id: 'qasar-e-noor',
        name: 'Qasar-e-Noor',
        area: 'Khursheed Alam Road, near Polo Ground, Cantt',
        city: 'Lahore',
        highlights: '5 Master Halls, 2 Corp. Halls',
        availableDates: 'Oct 2 - 4',
        rating: 4.94,
        reviewCount: 172,
        priceFrom: '3755.00',
        priceUnit: 'per_person',
        image: qasarENoorImg,
      },
      {
        id: 'the-palms-marquee',
        name: 'The Palms Marquee',
        area: 'Canal Bank Road, near DHA Phase 6',
        city: 'Lahore',
        highlights: '3 Grand Halls, Valet Parking',
        availableDates: 'Oct 10 - 12',
        rating: 4.86,
        reviewCount: 128,
        priceFrom: '4250.00',
        priceUnit: 'per_person',
        image: thePalmsMarqueeImg,
      },
      {
        id: 'rosewood-banquet',
        name: 'Rosewood Banquet',
        area: 'Main Boulevard, Gulberg III',
        city: 'Lahore',
        highlights: '2 Banquet Halls, Bridal Lounge',
        availableDates: 'Oct 18 - 20',
        rating: 4.78,
        reviewCount: 96,
        priceFrom: '3950.00',
        priceUnit: 'per_person',
        image: rosewoodBanquetImg,
      },
      {
        id: 'jasmine-garden',
        name: 'Jasmine Garden',
        area: 'Main Gulberg, near Liberty Market',
        city: 'Lahore',
        highlights: '3 Grand Halls, Valet Parking',
        availableDates: 'Oct 10 - 12',
        rating: 4.91,
        reviewCount: 156,
        priceFrom: '4250.00',
        priceUnit: 'per_person',
        image: jasmineGardenImg,
      },
      {
        id: 'pearl-banquet',
        name: 'Pearl Banquet',
        area: 'Main Boulevard, near Gulberg III',
        city: 'Lahore',
        highlights: '2 Banquet Halls, Bridal Lounge',
        availableDates: 'Oct 18 - 20',
        rating: 4.76,
        reviewCount: 104,
        priceFrom: '3950.00',
        priceUnit: 'per_person',
        image: pearlBanquetImg,
      },
      {
        id: 'imperial-manor',
        name: 'Imperial Manor',
        area: 'Mall Road, near Lawrence Garden',
        city: 'Lahore',
        highlights: 'Historic Venue, 500 Guests',
        availableDates: 'Nov 1 - 3',
        rating: 4.88,
        reviewCount: 142,
        priceFrom: '4800.00',
        priceUnit: 'per_person',
        image: imperialManorImg,
      },
    ],
  },
  {
    id: 'virtual-tour',
    title: '360 Virtual Tour Available',
    venues: [
      {
        id: 'heritage-palace',
        name: 'Heritage Palace',
        area: 'Mall Road, near Lawrence Garden',
        city: 'Lahore',
        highlights: 'Historic Venue, 500 Guests',
        availableDates: 'Nov 1 - 3',
        rating: 4.72,
        reviewCount: 88,
        priceFrom: '4800.00',
        priceUnit: 'per_person',
        image: heritagePalaceImg,
      },
      {
        id: 'liberty-grand-marquee',
        name: 'Liberty Grand Marquee',
        area: 'Airport Road, near Askari 10',
        city: 'Lahore',
        highlights: '3 Marquees, Spacious Parking',
        availableDates: 'Nov 8 - 10',
        rating: 4.89,
        reviewCount: 211,
        priceFrom: '4550.00',
        priceUnit: 'per_person',
        image: libertyGrandMarqueeImg,
      },
      {
        id: 'opal-pavilion',
        name: 'Opal Pavilion',
        area: 'Johar Town, near the main boulevard',
        city: 'Lahore',
        highlights: '5 Master Halls, 2 Corp. Halls',
        availableDates: 'Oct 2 - 4',
        rating: 4.50,
        reviewCount: 67,
        priceFrom: '3755.00',
        priceUnit: 'per_person',
        image: opalPavilionImg,
      },
      {
        id: 'azure-marquee',
        name: 'Azure Marquee',
        area: 'Airport Road, near Askari 10',
        city: 'Lahore',
        highlights: '3 Marquees, Spacious Parking',
        availableDates: 'Nov 8 - 10',
        rating: 4.84,
        reviewCount: 119,
        priceFrom: '4550.00',
        priceUnit: 'per_person',
        image: azureMarqueeImg,
      },
      {
        id: 'royal-hall',
        name: 'Royal Hall',
        area: 'Canal Bank Road, near DHA Phase 6',
        city: 'Lahore',
        highlights: '3 Grand Halls, Valet Parking',
        availableDates: 'Oct 10 - 12',
        rating: 4.79,
        reviewCount: 93,
        priceFrom: '4250.00',
        priceUnit: 'per_person',
        image: royalHallImg,
      },
      {
        id: 'heritage-court',
        name: 'Heritage Court',
        area: 'Khursheed Alam Road, near Polo Ground, Cantt',
        city: 'Lahore',
        highlights: '5 Master Halls, 2 Corp. Halls',
        availableDates: 'Oct 2 - 4',
        rating: 4.90,
        reviewCount: 165,
        priceFrom: '3755.00',
        priceUnit: 'per_person',
        image: heritageCourtImg,
      },
    ],
  },
  {
    id: 'top-food',
    title: 'Highly Rated in Good Food',
    venues: [
      {
        id: 'cedar-courtyard',
        name: 'Cedar Courtyard',
        area: 'DHA Phase 5, near the main boulevard',
        city: 'Lahore',
        highlights: '3 Grand Halls, Valet Parking',
        availableDates: 'Oct 10 - 12',
        rating: 4.57,
        reviewCount: 76,
        priceFrom: '4250.00',
        priceUnit: 'per_person',
        image: cedarCourtyardImg,
      },
      {
        id: 'saffron-palace',
        name: 'Saffron Palace',
        area: 'Model Town',
        city: 'Lahore',
        highlights: '2 Banquet Halls, Bridal Lounge',
        availableDates: 'Oct 18 - 20',
        rating: 4.64,
        reviewCount: 85,
        priceFrom: '3950.00',
        priceUnit: 'per_person',
        image: saffronPalaceImg,
      },
      {
        id: 'ivory-marquee',
        name: 'Ivory Marquee',
        area: 'Garden Town, near the main boulevard',
        city: 'Lahore',
        highlights: 'Historic Venue, 500 Guests',
        availableDates: 'Nov 1 - 3',
        rating: 4.71,
        reviewCount: 94,
        priceFrom: '4800.00',
        priceUnit: 'per_person',
        image: ivoryMarqueeImg,
      },
      {
        id: 'olive-banquet',
        name: 'Olive Banquet',
        area: 'Gulberg II',
        city: 'Lahore',
        highlights: '2 Banquet Halls, Bridal Lounge',
        availableDates: 'Oct 18 - 20',
        rating: 4.78,
        reviewCount: 103,
        priceFrom: '3950.00',
        priceUnit: 'per_person',
        image: oliveBanquetImg,
      },
      {
        id: 'amber-gardens',
        name: 'Amber Gardens',
        area: 'Bahria Town, near the main boulevard',
        city: 'Lahore',
        highlights: 'Historic Venue, 500 Guests',
        availableDates: 'Nov 1 - 3',
        rating: 4.85,
        reviewCount: 112,
        priceFrom: '4800.00',
        priceUnit: 'per_person',
        image: amberGardensImg,
      },
      {
        id: 'juniper-hall',
        name: 'Juniper Hall',
        area: 'Wapda Town, near the main boulevard',
        city: 'Lahore',
        highlights: '3 Grand Halls, Valet Parking',
        availableDates: 'Oct 10 - 12',
        rating: 4.92,
        reviewCount: 121,
        priceFrom: '4250.00',
        priceUnit: 'per_person',
        image: juniperHallImg,
      },
    ],
  },
  {
    id: 'top-aesthetics',
    title: 'Highly Rated in Good Aesthetics',
    venues: [
      {
        id: 'lotus-pavilion',
        name: 'Lotus Pavilion',
        area: 'Faisal Town',
        city: 'Lahore',
        highlights: '3 Marquees, Spacious Parking',
        availableDates: 'Nov 8 - 10',
        rating: 4.51,
        reviewCount: 130,
        priceFrom: '4550.00',
        priceUnit: 'per_person',
        image: lotusPavilionImg,
      },
      {
        id: 'velvet-court',
        name: 'Velvet Court',
        area: 'Johar Town, near the main boulevard',
        city: 'Lahore',
        highlights: '5 Master Halls, 2 Corp. Halls',
        availableDates: 'Oct 2 - 4',
        rating: 4.58,
        reviewCount: 139,
        priceFrom: '3755.00',
        priceUnit: 'per_person',
        image: velvetCourtImg,
      },
      {
        id: 'sapphire-hall',
        name: 'Sapphire Hall',
        area: 'DHA Phase 5, near the main boulevard',
        city: 'Lahore',
        highlights: '3 Grand Halls, Valet Parking',
        availableDates: 'Oct 10 - 12',
        rating: 4.65,
        reviewCount: 148,
        priceFrom: '4250.00',
        priceUnit: 'per_person',
        image: sapphireHallImg,
      },
      {
        id: 'magnolia-manor',
        name: 'Magnolia Manor',
        area: 'Model Town, near the main boulevard',
        city: 'Lahore',
        highlights: '5 Master Halls, 2 Corp. Halls',
        availableDates: 'Oct 2 - 4',
        rating: 4.72,
        reviewCount: 157,
        priceFrom: '3755.00',
        priceUnit: 'per_person',
        image: magnoliaManorImg,
      },
      {
        id: 'crystal-gardens',
        name: 'Crystal Gardens',
        area: 'Garden Town, near the main boulevard',
        city: 'Lahore',
        highlights: '3 Grand Halls, Valet Parking',
        availableDates: 'Oct 10 - 12',
        rating: 4.79,
        reviewCount: 166,
        priceFrom: '4250.00',
        priceUnit: 'per_person',
        image: crystalGardensImg,
      },
      {
        id: 'orchid-banquet',
        name: 'Orchid Banquet',
        area: 'Gulberg II',
        city: 'Lahore',
        highlights: '2 Banquet Halls, Bridal Lounge',
        availableDates: 'Oct 18 - 20',
        rating: 4.86,
        reviewCount: 175,
        priceFrom: '3950.00',
        priceUnit: 'per_person',
        image: orchidBanquetImg,
      },
    ],
  },
  {
    id: 'top-services',
    title: 'Highly Rated in Services',
    venues: [
      {
        id: 'emerald-marquee',
        name: 'Emerald Marquee',
        area: 'Bahria Town',
        city: 'Lahore',
        highlights: '2 Banquet Halls, Bridal Lounge',
        availableDates: 'Oct 18 - 20',
        rating: 4.93,
        reviewCount: 184,
        priceFrom: '3950.00',
        priceUnit: 'per_person',
        image: emeraldMarqueeImg,
      },
      {
        id: 'regal-pavilion',
        name: 'Regal Pavilion',
        area: 'Wapda Town, near the main boulevard',
        city: 'Lahore',
        highlights: 'Historic Venue, 500 Guests',
        availableDates: 'Nov 1 - 3',
        rating: 4.52,
        reviewCount: 193,
        priceFrom: '4800.00',
        priceUnit: 'per_person',
        image: regalPavilionImg,
      },
      {
        id: 'maple-courtyard',
        name: 'Maple Courtyard',
        area: 'Faisal Town',
        city: 'Lahore',
        highlights: '3 Marquees, Spacious Parking',
        availableDates: 'Nov 8 - 10',
        rating: 4.59,
        reviewCount: 202,
        priceFrom: '4550.00',
        priceUnit: 'per_person',
        image: mapleCourtyardImg,
      },
      {
        id: 'tulip-palace',
        name: 'Tulip Palace',
        area: 'Johar Town',
        city: 'Lahore',
        highlights: '3 Marquees, Spacious Parking',
        availableDates: 'Nov 8 - 10',
        rating: 4.66,
        reviewCount: 211,
        priceFrom: '4550.00',
        priceUnit: 'per_person',
        image: tulipPalaceImg,
      },
      {
        id: 'willow-gardens',
        name: 'Willow Gardens',
        area: 'DHA Phase 5, near the main boulevard',
        city: 'Lahore',
        highlights: '3 Grand Halls, Valet Parking',
        availableDates: 'Oct 10 - 12',
        rating: 4.73,
        reviewCount: 220,
        priceFrom: '4250.00',
        priceUnit: 'per_person',
        image: willowGardensImg,
      },
      {
        id: 'silver-hall',
        name: 'Silver Hall',
        area: 'Model Town, near the main boulevard',
        city: 'Lahore',
        highlights: '5 Master Halls, 2 Corp. Halls',
        availableDates: 'Oct 2 - 4',
        rating: 4.80,
        reviewCount: 229,
        priceFrom: '3755.00',
        priceUnit: 'per_person',
        image: silverHallImg,
      },
    ],
  },
  {
    id: 'popular-islamabad',
    title: 'Popular in Islamabad',
    venues: [
      {
        id: 'islamabad-grand',
        name: 'Islamabad Grand',
        area: 'G-11 Markaz',
        city: 'Islamabad',
        highlights: '5 Master Halls, 2 Corp. Halls',
        availableDates: 'Oct 2 - 4',
        rating: 4.87,
        reviewCount: 238,
        priceFrom: '3755.00',
        priceUnit: 'per_person',
        image: islamabadGrandImg,
      },
      {
        id: 'margalla-marquee',
        name: 'Margalla Marquee',
        area: 'E-11',
        city: 'Islamabad',
        highlights: '3 Grand Halls, Valet Parking',
        availableDates: 'Oct 10 - 12',
        rating: 4.94,
        reviewCount: 247,
        priceFrom: '4250.00',
        priceUnit: 'per_person',
        image: margallaMarqueeImg,
      },
      {
        id: 'blue-area-banquet',
        name: 'Blue Area Banquet',
        area: 'DHA Phase 2, near the main boulevard',
        city: 'Islamabad',
        highlights: '2 Banquet Halls, Bridal Lounge',
        availableDates: 'Oct 18 - 20',
        rating: 4.53,
        reviewCount: 256,
        priceFrom: '3950.00',
        priceUnit: 'per_person',
        image: blueAreaBanquetImg,
      },
      {
        id: 'grand-terrace',
        name: 'Grand Terrace',
        area: 'Bahria Enclave',
        city: 'Islamabad',
        highlights: '5 Master Halls, 2 Corp. Halls',
        availableDates: 'Oct 2 - 4',
        rating: 4.60,
        reviewCount: 265,
        priceFrom: '3755.00',
        priceUnit: 'per_person',
        image: grandTerraceImg,
      },
      {
        id: 'aurora-banquet',
        name: 'Aurora Banquet',
        area: 'F-7 Markaz',
        city: 'Islamabad',
        highlights: '3 Grand Halls, Valet Parking',
        availableDates: 'Oct 10 - 12',
        rating: 4.67,
        reviewCount: 274,
        priceFrom: '4250.00',
        priceUnit: 'per_person',
        image: auroraBanquetImg,
      },
      {
        id: 'copper-pavilion',
        name: 'Copper Pavilion',
        area: 'F-10 Markaz, near the main boulevard',
        city: 'Islamabad',
        highlights: '2 Banquet Halls, Bridal Lounge',
        availableDates: 'Oct 18 - 20',
        rating: 4.74,
        reviewCount: 283,
        priceFrom: '3950.00',
        priceUnit: 'per_person',
        image: copperPavilionImg,
      },
    ],
  },
  {
    id: 'popular-faisalabad',
    title: 'Popular in Faisalabad',
    venues: [
      {
        id: 'chenab-palace',
        name: 'Chenab Palace',
        area: 'D Ground, near the main boulevard',
        city: 'Faisalabad',
        highlights: 'Historic Venue, 500 Guests',
        availableDates: 'Nov 1 - 3',
        rating: 4.81,
        reviewCount: 292,
        priceFrom: '4800.00',
        priceUnit: 'per_person',
        image: chenabPalaceImg,
      },
      {
        id: 'sargodha-road-marquee',
        name: 'Sargodha Road Marquee',
        area: 'Canal Road, near the main boulevard',
        city: 'Faisalabad',
        highlights: '3 Marquees, Spacious Parking',
        availableDates: 'Nov 8 - 10',
        rating: 4.88,
        reviewCount: 301,
        priceFrom: '4550.00',
        priceUnit: 'per_person',
        image: sargodhaRoadMarqueeImg,
      },
      {
        id: 'canal-view-banquet',
        name: 'Canal View Banquet',
        area: 'Satiana Road, near the main boulevard',
        city: 'Faisalabad',
        highlights: '2 Banquet Halls, Bridal Lounge',
        availableDates: 'Oct 18 - 20',
        rating: 4.95,
        reviewCount: 310,
        priceFrom: '3950.00',
        priceUnit: 'per_person',
        image: canalViewBanquetImg,
      },
      {
        id: 'blossom-court',
        name: 'Blossom Court',
        area: 'Jaranwala Road, near the main boulevard',
        city: 'Faisalabad',
        highlights: 'Historic Venue, 500 Guests',
        availableDates: 'Nov 1 - 3',
        rating: 4.54,
        reviewCount: 319,
        priceFrom: '4800.00',
        priceUnit: 'per_person',
        image: blossomCourtImg,
      },
      {
        id: 'gardenia-hall',
        name: 'Gardenia Hall',
        area: 'Peoples Colony, near the main boulevard',
        city: 'Faisalabad',
        highlights: '3 Marquees, Spacious Parking',
        availableDates: 'Nov 8 - 10',
        rating: 4.61,
        reviewCount: 328,
        priceFrom: '4550.00',
        priceUnit: 'per_person',
        image: gardeniaHallImg,
      },
      {
        id: 'sterling-manor',
        name: 'Sterling Manor',
        area: 'Susan Road, near the main boulevard',
        city: 'Faisalabad',
        highlights: '2 Banquet Halls, Bridal Lounge',
        availableDates: 'Oct 18 - 20',
        rating: 4.68,
        reviewCount: 337,
        priceFrom: '3950.00',
        priceUnit: 'per_person',
        image: sterlingManorImg,
      },
    ],
  },
  {
    id: 'popular-lahore',
    title: 'Popular in Lahore',
    venues: [
      {
        id: 'sunset-marquee',
        name: 'Sunset Marquee',
        area: 'Faisal Town, near the main boulevard',
        city: 'Lahore',
        highlights: 'Historic Venue, 500 Guests',
        availableDates: 'Nov 1 - 3',
        rating: 4.75,
        reviewCount: 346,
        priceFrom: '4800.00',
        priceUnit: 'per_person',
        image: sunsetMarqueeImg,
      },
      {
        id: 'vista-palace',
        name: 'Vista Palace',
        area: 'Johar Town',
        city: 'Lahore',
        highlights: '3 Marquees, Spacious Parking',
        availableDates: 'Nov 8 - 10',
        rating: 4.82,
        reviewCount: 355,
        priceFrom: '4550.00',
        priceUnit: 'per_person',
        image: vistaPalaceImg,
      },
      {
        id: 'oak-banquet',
        name: 'Oak Banquet',
        area: 'DHA Phase 5, near the main boulevard',
        city: 'Lahore',
        highlights: '5 Master Halls, 2 Corp. Halls',
        availableDates: 'Oct 2 - 4',
        rating: 4.89,
        reviewCount: 364,
        priceFrom: '3755.00',
        priceUnit: 'per_person',
        image: oakBanquetImg,
      },
      {
        id: 'dahlia-gardens',
        name: 'Dahlia Gardens',
        area: 'Model Town',
        city: 'Lahore',
        highlights: '3 Marquees, Spacious Parking',
        availableDates: 'Nov 8 - 10',
        rating: 4.96,
        reviewCount: 373,
        priceFrom: '4550.00',
        priceUnit: 'per_person',
        image: dahliaGardensImg,
      },
      {
        id: 'celestial-hall',
        name: 'Celestial Hall',
        area: 'Garden Town, near the main boulevard',
        city: 'Lahore',
        highlights: '3 Grand Halls, Valet Parking',
        availableDates: 'Oct 10 - 12',
        rating: 4.55,
        reviewCount: 382,
        priceFrom: '4250.00',
        priceUnit: 'per_person',
        image: celestialHallImg,
      },
      {
        id: 'crown-pavilion',
        name: 'Crown Pavilion',
        area: 'Gulberg II, near the main boulevard',
        city: 'Lahore',
        highlights: '5 Master Halls, 2 Corp. Halls',
        availableDates: 'Oct 2 - 4',
        rating: 4.62,
        reviewCount: 391,
        priceFrom: '3755.00',
        priceUnit: 'per_person',
        image: crownPavilionImg,
      },
    ],
  },
]

// ---------------------------------------------------------------------------
// Venue detail builder
// ---------------------------------------------------------------------------
// Every venue's detail fields are derived deterministically from its id and card data, so the same venue always
// shows the same details and the card and detail page agree (rating, review count, Menu 1 = "starting from" price).
// Field names follow db/schema.sql in camelCase: venues, venue_images, menu_packages + menu_items, reviews.
//
// NOT IN THE SRS/ERD (UI-only, from the Figma design, flagged for a decision): `halls`, `ratingCategories`,
// `host`, `parkingSpaces`, `eventNotes`. A real API would need new tables/columns for these.

const FLOOR_PLANS = [floorplan1Img, floorplan2Img, floorplan3Img]

// Photo pools per gallery section (Figma gallery frame 90:1063). The Hall pool also uses the venue card photos.
const GALLERY_POOLS = {
  tour: [tour1Img, hall1Img, hall3Img, hall4Img],
  hall: [hall1Img, hall2Img, hall3Img, hall4Img],
  stage: [stage1Img, stage2Img, stage3Img, stage4Img, gallery2Img, gallery4Img],
  bridal: [bridal1Img, bridal2Img, bridal3Img, bridal4Img],
  bathroom: [bathroom1Img, bathroom2Img, bathroom3Img, bathroom4Img],
  parking: [parking1Img, parking2Img, parking3Img, parking4Img],
  entrance: [entrance1Img, entrance2Img, entrance3Img, entrance4Img, gallery1Img, gallery3Img, gallery5Img],
  hallway: [hallway1Img, hallway2Img, hallway3Img, hallway4Img],
}

// Approximate real coordinates for the areas our venues are in (venues.location). Each venue is offset a little
// from its area so venues in the same area get distinct map markers. First match wins (Gulberg III before II).
const AREA_COORDS = [
  ['Polo Ground', 31.5245, 74.366], ['Canal Bank Road', 31.479, 74.427], ['Liberty', 31.5107, 74.3446], ['Gulberg III', 31.5085, 74.343],
  ['Lawrence Garden', 31.556, 74.3285], ['Askari 10', 31.515, 74.403], ['Johar Town', 31.4697, 74.2728], ['DHA Phase 5', 31.463, 74.411],
  ['Model Town', 31.484, 74.326], ['Garden Town', 31.502, 74.312], ['Gulberg II', 31.525, 74.351], ['Bahria Town', 31.37, 74.185],
  ['Faisal Town', 31.479, 74.302], ['Wapda Town', 31.438, 74.265],
  ['G-11', 33.668, 72.996], ['E-11', 33.696, 72.98], ['DHA Phase 2', 33.528, 73.165], ['Bahria Enclave', 33.712, 73.216],
  ['F-7', 33.721, 73.056], ['F-10', 33.695, 73.013],
  ['D Ground', 31.4005, 73.1105], ['Canal Road', 31.438, 73.121], ['Satiana Road', 31.395, 73.063], ['Jaranwala Road', 31.418, 73.14],
  ['Peoples Colony', 31.396, 73.1], ['Susan Road', 31.4205, 73.096],
]
const PROVINCE = { Lahore: 'Punjab', Faisalabad: 'Punjab', Islamabad: 'Islamabad Capital Territory' }

// Tiny seeded RNG (mulberry32) so each venue gets stable "random" details.
function seededRandom(seedText) {
  let seed = [...seedText].reduce((hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16777619), 2166136261) >>> 0
  return () => {
    seed = (seed + 0x6d2b79f5) >>> 0
    let t = seed
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const pick = (rand, list) => list[Math.floor(rand() * list.length)]
const pickSome = (rand, list, count) =>
  list
    .map((item) => [rand(), item])
    .sort((a, b) => a[0] - b[0])
    .slice(0, count)
    .map(([, item]) => item)
const between = (rand, min, max, step = 1) => min + step * Math.floor(rand() * ((max - min) / step + 1))

const CITY_INFO = {
  Lahore: { lat: 31.5204, lng: 74.3587, landmarks: ['DHA Phase 6', 'Gulberg', 'Liberty Market', 'Model Town', 'Lahore Canal'], airport: 'Allama Iqbal International Airport' },
  Islamabad: { lat: 33.6844, lng: 73.0479, landmarks: ['F-7 Markaz', 'Blue Area', 'Faisal Mosque', 'Centaurus Mall', 'Margalla Road'], airport: 'Islamabad International Airport' },
  Faisalabad: { lat: 31.4504, lng: 73.135, landmarks: ['Clock Tower', 'D Ground', 'Canal Road', 'Lyallpur Galleria', 'Susan Road'], airport: 'Faisalabad International Airport' },
}

// venue_type enum: indoor | outdoor | semi_outdoor
function venueStyle(name) {
  if (/garden|lawn|terrace|courtyard/i.test(name)) return { venueType: 'semi_outdoor', tagline: 'Garden & Lawn Venue', kind: 'Garden event venue' }
  if (/marquee/i.test(name)) return { venueType: 'outdoor', tagline: 'Marquee & Lawn', kind: 'Marquee and lawn' }
  if (/palace|manor|grand/i.test(name)) return { venueType: 'indoor', tagline: 'Banquet Palace', kind: 'Private event estate' }
  if (/pavilion|court/i.test(name)) return { venueType: 'semi_outdoor', tagline: 'Event Pavilion', kind: 'Event pavilion' }
  return { venueType: 'indoor', tagline: 'Banquet & Events', kind: 'Banquet venue' }
}


const HALL_TEMPLATES = [
  { name: 'Grand Ballroom', kind: 'hall', description: 'The largest indoor space, ideal for weddings, corporate dinners and large receptions with a dedicated stage, bar and buffet area.' },
  { name: 'Jasmine Pavilion', kind: 'hall', description: 'A versatile indoor hall suited for mehndi evenings, corporate launches and smaller wedding receptions with a compact stage and lounge area.' },
  { name: 'Garden Lawn', kind: 'lawn', description: 'An outdoor lawn with flexible seating layouts, ideal for daytime events, mehndi gatherings and cocktail receptions under the trees.' },
  { name: 'Crystal Hall', kind: 'hall', description: 'A chandelier-lit hall with a raised stage and a separate family seating section, popular for barat and walima receptions.' },
  { name: 'Royal Court', kind: 'hall', description: 'A mid-sized hall with high ceilings and a private entrance, well suited to engagements and family dinners.' },
  { name: 'Marquee Lawn', kind: 'lawn', description: 'A tented lawn that can be dressed for any theme, with side walls for winter evenings and open sides for summer.' },
]
const BRIDAL_SUITE = {
  name: 'Bridal Suite',
  description: 'A private preparation space with makeup area, lounge seating and a dedicated entry for the bridal party before the event.',
  areas: ['Mirror', 'Dressing', 'Entry', 'Seating', 'Lounge', 'Private lounge'],
}
// The three mock floor plans all have the stage at the back centre, the foyer entrance on the middle right and the
// hall floor in the middle (cells of the wizard's 3 x 3 layout grid, row 0 = back wall).
const PLAN_ZONES = { stage: 1, entrance: 5, seating: 4 }

// Menu sections in the order the wizard offers them (menu_items.category). Mock dish strings are split into one item
// per dish and sorted into a section by keyword.
const MENU_SECTION_ORDER = ['Appetizers', 'Main course', 'Rice / Biryani', 'BBQ', 'Breads', 'Desserts / Sweets', 'Drinks']
function mainCourseSection(dish) {
  if (/pulao|biryani/i.test(dish)) return 'Rice / Biryani'
  if (/bbq|kebab|tikka|boti|steak|shawarma/i.test(dish)) return 'BBQ'
  if (/naan/i.test(dish)) return 'Breads'
  return 'Main course'
}
const capitalise = (text) => text.charAt(0).toUpperCase() + text.slice(1)

const STARTERS = ['Soup, crackers, mint margarita', 'Chicken corn soup, garlic bread, lemonade', 'Hot and sour soup, spring rolls, mint margarita', 'Cream of mushroom soup, canapés, piña colada', 'Fish crackers, chaat counter, fresh lime', 'Dahi bhallay, samosa chaat, peach iced tea']
const MAINS = ['Chicken karahi, chicken pulao, chicken BBQ, live steak', 'Mutton qorma, vegetable pulao, chicken tikka, live pasta', 'Chicken handi, biryani, seekh kebab, live shawarma', 'Mutton karahi, Afghani pulao, malai boti, live steak', 'Beef nihari, chicken biryani, reshmi kebab, live naan', 'Palak paneer, daal makhni, vegetable biryani, chicken tikka']
const DESSERTS = ['Kheer, custard, ice cream', 'Gulab jamun, fruit trifle, ice cream', 'Gajar halwa, custard, ice cream', 'Kheer, chocolate mousse, ice cream', 'Shahi tukray, ras malai, kulfi', 'Firni, brownies, fresh fruit']
const DRINKS = ['Coke, Sprite, Fanta, water', 'Soft drinks, mineral water, green tea', 'Soft drinks, fresh juices, kashmiri chai']
const MENU_TIERS = [
  'A balanced selection of comfort favorites, live grills and classic desserts for weddings and corporate events.',
  'A premium option with richer flavors, live pasta and a broader dessert spread for formal gatherings.',
  'A flavorful package with spicy favorites, live stations and comforting desserts for lively celebrations.',
  'A premium selection with richer proteins, premium desserts and a sophisticated beverage pairing for high-end events.',
]
// Menu 1 always equals the card's "starting from" per-person price.
const MENU_STEPS = [0, 495, 995, 1495]

const REVIEWERS = [
  ['Amna Khan', 'Lahore'], ['Syed Raza', 'Islamabad'], ['Fatima Qureshi', 'Karachi'], ['Omar Malik', 'Lahore'], ['Hira Siddiqui', 'Faisalabad'],
  ['Bilal Ahmed', 'Rawalpindi'], ['Zainab Hussain', 'Lahore'], ['Usman Tariq', 'Islamabad'], ['Mahnoor Ali', 'Multan'], ['Hamza Sheikh', 'Faisalabad'],
  ['Ayesha Javed', 'Lahore'], ['Ali Haider', 'Sialkot'], ['Sana Iqbal', 'Islamabad'], ['Danish Mirza', 'Gujranwala'],
]
const REVIEW_TEXTS = {
  wedding: 'Absolutely stunning venue. The hall was beautifully maintained and exceeded our expectations. The team was incredibly responsive and helped us coordinate every detail of our daughter’s wedding.',
  mehndi: 'The setup for our mehndi was breathtaking. The stage décor team transformed the space beautifully and our guests couldn’t stop complimenting the venue throughout the evening.',
  barat: 'Arrival for the barat was smooth, with plenty of parking and staff guiding guests. Food was served hot and on time for over 400 guests.',
  walima: '{name} delivered everything they promised and more. Impeccable service and a flawlessly organized evening. The event manager was available at every moment.',
  engagement: 'We booked a smaller space for our engagement and it felt intimate without being cramped. Lighting and sound were spot on.',
  birthday: 'Hosted a 50th birthday dinner here. The staff handled a last-minute change in guest count without any fuss. Desserts were the highlight.',
  corporate: 'We hosted our company’s annual dinner here. Valet was seamless, the catering was top-notch, and the climate control kept everyone comfortable. Highly recommended for corporate gatherings.',
}
const POLICIES = [
  ['Outside photographers welcome', 'Indoor fireworks by approval'],
  ['Outside decorators allowed', 'No outside catering'],
  ['Sound must stop by 10:00 PM', 'Outside photographers welcome'],
  ['Separate family seating available', 'Valet included for all events'],
]

// What `SELECT rating, count(*) FROM reviews WHERE venue_id = $1 GROUP BY rating` would return.
function ratingCounts(avg, total) {
  const fives = Math.round(total * Math.min(0.95, Math.max(0.4, avg - 4)))
  const fours = Math.round((total - fives) * 0.75)
  const threes = Math.round((total - fives - fours) * 0.6)
  const twos = Math.round((total - fives - fours - threes) * 0.6)
  return { 5: fives, 4: fours, 3: threes, 2: twos, 1: total - fives - fours - threes - twos }
}

const isoDay = (year, month, day) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

function buildVenue(card, allCards) {
  const rand = seededRandom(card.id)
  const style = venueStyle(card.name)
  const city = CITY_INFO[card.city] ?? CITY_INFO.Lahore
  const guestsInName = card.highlights.match(/(\d+) Guests/)
  const capacity = guestsInName ? Number(guestsInName[1]) : between(rand, 350, 1000, 50)
  const pricePerHead = Number(card.priceFrom)

  // Halls: 1–4 bookable spaces per venue, shaped like a proposed `halls` table (hall_id, venue_id, name, capacity).
  // NOT IN THE ERD: db/schema.sql has no halls table yet. The largest hall's capacity is the venue capacity.
  const spacesInHighlights = (card.highlights.match(/\d+(?= (?:Master|Corp|Grand|Banquet|Marquee))/g) ?? []).reduce((sum, n) => sum + Number(n), 0)
  const hallCount = guestsInName ? 1 : Math.min(4, Math.max(1, spacesInHighlights))
  const layoutRand = seededRandom(`${card.id}:layout`) // own seed: new fields don't change the existing picks
  const templates = pickSome(rand, style.venueType === 'indoor' ? HALL_TEMPLATES.filter((h) => h.kind === 'hall') : HALL_TEMPLATES, hallCount)
  const halls = templates.map((template, index) => {
    const hallCapacity = index === 0 ? capacity : between(rand, 100, Math.max(100, capacity - 50), 50)
    // Same rand() calls as before (metres), converted to feet, so the other mock details don't shift.
    const widthM = between(rand, 16, 26)
    const lengthM = widthM + between(rand, 4, 8)
    return {
      hallId: `${card.id}-hall-${index + 1}`,
      venueId: card.id,
      name: template.name,
      capacity: hallCapacity,
      standingCapacity: Math.round((hallCapacity * 1.4) / 50) * 50,
      // UI-only, like the wizard's hall fields: size in feet, layout and walkthrough.
      widthFt: Math.round((widthM * 3.28) / 5) * 5,
      lengthFt: Math.round((lengthM * 3.28) / 5) * 5,
      ceilingFt: between(layoutRand, 14, 24),
      description: template.description,
      floorPlanUrl: FLOOR_PLANS[index % FLOOR_PLANS.length],
      floorPlanType: 'image',
      zones: PLAN_ZONES,
      walkthrough: { mode: layoutRand() < 0.85 ? 'generate' : 'skip', url: '' },
    }
  })
  // The bridal suite is a preparation room, not a bookable hall.
  const bridalSuite = {
    hallId: `${card.id}-suite`,
    venueId: card.id,
    name: BRIDAL_SUITE.name,
    capacity: 20,
    standingCapacity: 40,
    widthFt: 40,
    lengthFt: 45,
    description: BRIDAL_SUITE.description,
    areas: BRIDAL_SUITE.areas,
  }

  // Photo gallery: one set of sections per hall. Hall 1's "Hall" section opens with the card
  // photo, which is also the hero image on the venue page.
  const otherCardPhotos = allCards.filter((c) => c.id !== card.id).map((c) => c.image)
  const gallery = halls.map((hall, hallIndex) => ({
    hallId: hall.hallId,
    sections: GALLERY_SECTIONS.map((section) => {
      const count = section.key === 'tour' ? 1 : 4
      const pool = section.key === 'hall' ? [...GALLERY_POOLS.hall, ...otherCardPhotos] : GALLERY_POOLS[section.key]
      let urls = pickSome(rand, pool, count)
      if (section.key === 'hall' && hallIndex === 0) urls = [card.image, ...urls.slice(0, 3)]
      return {
        key: section.key,
        images: urls.map((imageUrl, index) => ({
          imageId: `${card.id}-h${hallIndex + 1}-${section.key}-${index + 1}`,
          venueId: card.id,
          hallId: hall.hallId,
          category: section.key,
          imageUrl,
          alt: `${card.name}, ${hall.name}: ${section.title.toLowerCase()} photo ${index + 1}`,
          verificationStatus: 'genuine',
          isPublished: true,
        })),
      }
    }),
  }))
  const images = gallery.flatMap((hallGallery) => hallGallery.sections.flatMap((section) => section.images))
  const hall1 = Object.fromEntries(gallery[0].sections.map((section) => [section.key, section.images]))
  // Hero mosaic on the venue page: card photo, then stage, hall, entrance and parking photos from Hall 1.
  const heroImages = [hall1.hall[0], hall1.stage[0], hall1.hall[1], hall1.entrance[0], hall1.parking[0]]

  const menuPackages = MENU_STEPS.map((step, index) => ({
    menuId: `${card.id}-menu-${index + 1}`,
    venueId: card.id,
    name: `Menu ${index + 1}`,
    description: MENU_TIERS[index],
    pricePerHead: `${pricePerHead + step}.00`,
    isCustomizable: index === 3,
    minGuests: 100,
    // menu_items: one row per dish, category = section. Ordered by section, like the wizard saves them.
    items: [
      ...STARTERS[(index + between(rand, 0, 1)) % STARTERS.length].split(', ').map((name) => ({ category: 'Appetizers', name })),
      ...MAINS[(index + between(rand, 0, 2)) % MAINS.length].split(', ').map((name) => ({ category: mainCourseSection(name), name })),
      ...DESSERTS[(index + between(rand, 0, 2)) % DESSERTS.length].split(', ').map((name) => ({ category: 'Desserts / Sweets', name })),
      ...pick(rand, DRINKS).split(', ').map((name) => ({ category: 'Drinks', name })),
    ]
      .sort((a, b) => MENU_SECTION_ORDER.indexOf(a.category) - MENU_SECTION_ORDER.indexOf(b.category))
      .map((item, itemIndex) => ({ itemId: `${card.id}-menu-${index + 1}-item-${itemIndex + 1}`, ...item, name: capitalise(item.name), isOptional: false })),
  }))

  const eventTypes = Object.keys(EVENT_LABELS)
  const reviews = pickSome(rand, REVIEWERS, 6).map(([customerName, customerCity], index) => {
    const eventType = pick(rand, eventTypes)
    return {
      reviewId: `${card.id}-review-${index + 1}`,
      venueId: card.id,
      customerName,
      customerCity: `${customerCity}, Pakistan`,
      rating: rand() < card.rating - 4 + 0.1 ? 5 : 4,
      comment: REVIEW_TEXTS[eventType].replace('{name}', card.name),
      eventType,
      createdAt: new Date(Date.UTC(2026, 10, 10) - between(rand, 6, 70) * 86400000).toISOString(),
    }
  })
  const ratingCategories = ['Cleanliness', 'Accuracy', 'Check-in', 'Communication', 'Location', 'Value'].map((name) => ({
    name,
    score: Math.min(5, card.rating - 0.15 + rand() * 0.35).toFixed(1),
  }))

  // Booked dates over the next three months (time_slots with status = 'booked').
  const bookedDates = new Set()
  for (const [year, month, days] of [[2026, 11, 30], [2026, 12, 31], [2027, 1, 31]]) {
    const count = between(rand, 4, 7)
    for (let i = 0; i < count; i++) bookedDates.add(isoDay(year, month, between(rand, 1, days)))
  }

  const areaPoint = AREA_COORDS.find(([key]) => card.area.includes(key)) ?? [card.city, city.lat, city.lng]
  const landmark = pick(rand, city.landmarks)
  const minutes = between(rand, 8, 25)
  // The six headline amenities are dropped now and then (own seed, so the picks above stay the same) so the Explore
  // amenity and "catering included" filters have something to filter.
  const amenityRand = seededRandom(`${card.id}:amenities`)
  const headline = AMENITIES.slice(0, 6).filter((a) => amenityRand() < (a.key === 'catering' ? 0.7 : 0.8))
  const facilities = [...headline, ...pickSome(rand, AMENITIES.slice(6), between(rand, 4, 8))].map((a) => a.key)

  // Booking terms, add-ons and hall hire (own seed again). Shaped like the wizard's answers (listingToVenue in
  // api/listings.js builds the same fields from a submitted listing).
  const bookingRand = seededRandom(`${card.id}:booking`)
  const cancellationPolicy = pick(bookingRand, ['flexible', 'moderate', 'strict', 'custom'])
  const bookingTerms = {
    advancePercent: pick(bookingRand, [20, 25, 30, 50]),
    cancellationPolicy,
    customTiers: cancellationPolicy === 'custom' ? [{ fromDays: '60', toDays: '', refundPercent: '100' }, { fromDays: '14', toDays: '60', refundPercent: '50' }, { fromDays: '0', toDays: '14', refundPercent: '0' }] : [],
    houseRules: [], // set below from the event notes
  }
  const addOns = [
    bookingRand() < 0.85 && { type: 'sound_system', name: 'DJ with sound system', description: 'Line array speakers, two wireless mics and a DJ for the full slot.', price: `${between(bookingRand, 30, 60, 5) * 1000}.00` },
    bookingRand() < 0.7 && { type: 'smd', name: 'SMD screen (10 × 6 ft)', description: 'Outdoor-grade LED screen with live camera feed.', price: `${between(bookingRand, 15, 30, 5) * 1000}.00` },
  ]
    .filter(Boolean)
    .map((addOn, index) => ({ addOnId: `${card.id}-addon-${index + 1}`, venueId: card.id, ...addOn, isAvailable: true }))
  const hallCharges = halls.map((hall) => `${Math.round((hall.capacity * between(bookingRand, 80, 160)) / 5000) * 5000}.00`)

  const venue = {
    ...card,
    // venues
    tagline: style.tagline,
    kindLabel: style.kind,
    address: `${card.area}, ${card.city}, ${PROVINCE[card.city] ?? 'Punjab'}, Pakistan`,
    lat: +(areaPoint[1] + (rand() - 0.5) * 0.005).toFixed(5),
    lng: +(areaPoint[2] + (rand() - 0.5) * 0.005).toFixed(5),
    nearby: `${minutes} min from ${landmark}`,
    locationDescription: `Located in ${card.area}, ${card.name} is about ${minutes} minutes from ${landmark} and ${between(rand, 20, 45)} minutes from ${city.airport}. Signage and parking attendants guide guests on arrival.`,
    venueType: style.venueType,
    supportedEvents: pickSome(rand, eventTypes, 4),
    capacity,
    minGuests: 25,
    basePrice: `${Math.round((pricePerHead * 110) / 5000) * 5000}.00`,
    facilities,
    description: `${card.name} is a ${style.kind.toLowerCase()} in ${card.area}, ${card.city}, arranged for weddings, mehndi evenings and private celebrations of up to ${capacity} guests. ${card.highlights} give hosts room to plan separate functions on the same day, with independent guest arrival and an experienced on-site events team. Catering is handled in-house with menus from Rs ${pricePerHead.toLocaleString('en-US')} per head, and the team can coordinate décor, sound and lighting with your own vendors.`,
    avgRating: card.rating,
    approvalStatus: 'approved',
    isActive: true,
    images,
    heroImages,
    gallery,
    menuPackages,
    reviews,
    ratingCounts: ratingCounts(card.rating, card.reviewCount),
    bookedDates: [...bookedDates].sort(),
    addOns, // add_ons
    // UI-only, not in the SRS/ERD (see note above). hallCharge: flat hire per slot, no column yet.
    halls: halls.map((hall, index) => ({ ...hall, hallCharge: hallCharges[index] })),
    bookingTerms,
    bridalSuite,
    ratingCategories,
    host: { name: `${card.name} events team`, replyMinutes: between(rand, 10, 45, 5), isTopHost: card.rating >= 4.8, yearsHosting: between(rand, 3, 15) },
    parkingSpaces: between(rand, 40, 200, 10),
    eventNotes: { timing: [`Day events from ${pick(rand, ['11:00 AM', '12:00 PM'])}`, `Evening events until ${pick(rand, ['10:30 PM', '11:00 PM', '11:30 PM'])}`], policies: pick(rand, POLICIES) },
  }
  // House rules are the same lines the page shows under "Event notes".
  venue.bookingTerms.houseRules = venue.eventNotes.policies
  return venue
}

const allCards = landingSections.flatMap((section) => section.venues)
const venuesById = new Map(allCards.map((card) => [card.id, buildVenue(card, allCards)]))

export function getMockVenue(id) {
  return venuesById.get(id) ?? null
}

// Every venue once (the landing rows repeat none, but dedupe anyway), for the mock search in api/venues.js.
export function getAllMockVenues() {
  return [...venuesById.values()]
}
