import { CommonModule } from '@angular/common';
import { Component, Input, computed, inject, input, signal } from '@angular/core';
import { SkeletonModule } from 'primeng/skeleton';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { formatCNPJ } from '@/core/utils/cnpj.utils';
import { Purpose, PurposeService } from '@/features/configurations/services/purpose.service';
import { ProposalType, ProposalTypeService } from '@/features/configurations/services/proposal.service';
import { normalizeLabel } from '@/features/shared/helpers/normalizeLabel';
import { INVESTIMENT_LABELS, PcrV2State } from '../../pcr-v2.model';
import {
  PCR_V2_BOOLEAN_LABELS,
  PCR_V2_DISPLAY,
  PCR_V2_PROPOSAL_SUMMARY_LABELS,
  PCR_V2_PROPOSAL_SUMMARY_MESSAGES,
  PCR_V2_PROPOSAL_SUMMARY_VARIANTS,
  type ProposalSummaryVariantType,
} from '../../pcr-v2.constants';
import { PcrV2Service } from '../../services/pcr-v2.service';
import { toArr } from '../../services/commercial-propose.service';
import { imageInvestmentTotal, investmentGrandTotal, investmentTotalByTypes, investmentUnitValueFromApiByTypes } from '../../utils/investment.util';
import { contractPendingVolumeConsideration } from '../../utils/contract.util';
import { getRouteProposalId } from '../../utils/proposal-route.util';
import { ProposalSummaryService } from './proposal-summary.service';
import { IProposalSummary, ISummaryAmount, ISummaryApprovedSimulation } from './proposal-summary.model';
import { CustomerFinancialHealth, CustomerFinancialHealthService } from '../../services/customer-financial-health.service';

interface IProposalSummaryInvestmentRow {
  key: string;
  label: string;
  amount: ISummaryAmount | null;
}

interface IProposalInvestmentAmounts {
  concessionTotal: ISummaryAmount | null;
  lostFund: ISummaryAmount | null;
  returnableLoan: ISummaryAmount | null;
  projectedRebate: ISummaryAmount | null;
  image: ISummaryAmount | null;
  environmental: ISummaryAmount | null;
  retail: ISummaryAmount | null;
  equipmentResidual: ISummaryAmount | null;
  legalCosts: ISummaryAmount | null;
}

interface IProposalSummaryDetailRow {
  key?: string;
  label: string;
  value: string;
  badge?: 'yes' | 'no' | null;
}

interface IProposalSummaryContextItem {
  key: string;
  icon: string;
  label: string;
  value: string;
}

interface IProposalStructureNode {
  icon: string;
  label: string;
  value: string;
}

interface IProposalStructureTag {
  icon: string;
  label: string;
  value: string;
}

interface IProposalCommercialContextItem {
  key: string;
  icon: string;
  label: string;
  value: string;
  badge: 'yes' | 'no' | null;
}

interface IProposalAlertItem {
  icon: string;
  label: string;
  value: string;
  tone: 'positive' | 'negative' | 'neutral';
}

interface IProposalHighlight {
  icon: string;
  label: string;
  value: string;
  caption: string;
  tone: 'volume' | 'investment' | 'concession' | 'margin';
}

interface IProposalStat {
  icon: string;
  label: string;
  value: string;
}

interface IProposalContact {
  icon: string;
  role: string;
  name: string;
}

@Component({
  selector: 'pcr-proposal-summary',
  standalone: true,
  imports: [CommonModule, SkeletonModule],
  templateUrl: './proposal-summary.html',
  styleUrl: './proposal-summary.scss',
})
export class ProposalSummary {
  private readonly proposalSummaryService = inject(ProposalSummaryService);
  private readonly customerFinancialHealthService = inject(CustomerFinancialHealthService);
  private readonly pcrV2Service = inject(PcrV2Service);
  private readonly purposeService = inject(PurposeService);
  private readonly proposalTypeService = inject(ProposalTypeService);
  private readonly route = inject(ActivatedRoute);
  private loadToken = 0;

  readonly emptyDisplay = PCR_V2_DISPLAY.empty;
  readonly skeletonItems = Array.from({ length: 6 }, (_, i) => i);
  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly summary = signal<IProposalSummary | null>(null);
  readonly proposal = signal<PcrV2State | null>(null);
  readonly customerFinancialHealth = signal<CustomerFinancialHealth | null>(null);
  readonly purposes = signal<Purpose[]>([]);
  readonly proposalTypes = signal<ProposalType[]>([]);
  readonly labels = PCR_V2_PROPOSAL_SUMMARY_LABELS;
  readonly messages = PCR_V2_PROPOSAL_SUMMARY_MESSAGES;
  readonly variant = signal<ProposalSummaryVariantType>(PCR_V2_PROPOSAL_SUMMARY_VARIANTS.full);

  @Input() title = PCR_V2_PROPOSAL_SUMMARY_LABELS.title;

  readonly showAlertsSignal = signal(true);

  showApprovedSimulation = input(true);


  showStructureNode = input(true);

  @Input() set showAlerts(value: boolean | null | undefined) {
    this.showAlertsSignal.set(value !== false);
  }

  @Input() showClientData = true;

  readonly showCustomerSignal = signal(true);

  @Input() set showCustomer(value: boolean | null | undefined) {
    this.showCustomerSignal.set(value !== false);
  }

  readonly showOverviewSignal = signal(true);

  @Input() set showOverview(value: boolean | null | undefined) {
    this.showOverviewSignal.set(value !== false);
  }

  readonly showCreditIndicatorsSignal = signal(true);

  @Input() set showCreditIndicators(value: boolean | null | undefined) {
    this.showCreditIndicatorsSignal.set(value !== false);
  }

  readonly showInvestmentsSignal = signal(true);

  @Input() set showInvestments(_value: boolean | null | undefined) {
    this.showInvestmentsSignal.set(true);
  }

  readonly hiddenApprovalFieldKeysSignal = signal<readonly string[]>([]);

  @Input() set hiddenApprovalFieldKeys(value: readonly string[] | null | undefined) {
    this.hiddenApprovalFieldKeysSignal.set(value ?? []);
  }

  readonly hiddenInvestmentFieldKeysSignal = signal<readonly string[]>([]);

  @Input() set hiddenInvestmentFieldKeys(_value: readonly string[] | null | undefined) {
    this.hiddenInvestmentFieldKeysSignal.set([]);
  }

  readonly hiddenCommercialContextFieldKeysSignal = signal<readonly string[]>([]);

  @Input() set hiddenCommercialContextFieldKeys(value: readonly string[] | null | undefined) {
    this.hiddenCommercialContextFieldKeysSignal.set(value ?? []);
  }

  readonly hiddenOverviewFieldKeysSignal = signal<readonly string[]>([]);

  @Input() set hiddenOverviewFieldKeys(value: readonly string[] | null | undefined) {
    this.hiddenOverviewFieldKeysSignal.set(value ?? []);
  }

  readonly showCommercialContextSignal = signal(true);

  @Input() set showCommercialContext(value: boolean | null | undefined) {
    this.showCommercialContextSignal.set(value !== false);
  }

  readonly showHighlightsSignal = signal(true);

  @Input() set showHighlights(value: boolean | null | undefined) {
    this.showHighlightsSignal.set(value !== false);
  }

  readonly showResponsibleSignal = signal(true);

  @Input() set showResponsible(value: boolean | null | undefined) {
    this.showResponsibleSignal.set(value !== false);
  }

  readonly showCustomerSegmentationSignal = signal(true);

  @Input() set showCustomerSegmentation(value: boolean | null | undefined) {
    this.showCustomerSegmentationSignal.set(value !== false);
  }

  readonly showSerasaRatingSignal = signal(true);

  @Input() set showSerasaRating(value: boolean | null | undefined) {
    this.showSerasaRatingSignal.set(value !== false);
  }

  @Input() set variantMode(value: ProposalSummaryVariantType | null | undefined) {
    if (value === PCR_V2_PROPOSAL_SUMMARY_VARIANTS.compact) {
      this.variant.set(PCR_V2_PROPOSAL_SUMMARY_VARIANTS.compact);
      return;
    }

    if (value === PCR_V2_PROPOSAL_SUMMARY_VARIANTS.minimal) {
      this.variant.set(PCR_V2_PROPOSAL_SUMMARY_VARIANTS.minimal);
      return;
    }

    this.variant.set(PCR_V2_PROPOSAL_SUMMARY_VARIANTS.full);
  }

  readonly isMinimal = computed(() => this.variant() === PCR_V2_PROPOSAL_SUMMARY_VARIANTS.minimal);
  readonly isCompact = computed(() =>
    this.variant() === PCR_V2_PROPOSAL_SUMMARY_VARIANTS.compact
    || this.variant() === PCR_V2_PROPOSAL_SUMMARY_VARIANTS.minimal,
  );
  readonly isFull = computed(() => this.variant() === PCR_V2_PROPOSAL_SUMMARY_VARIANTS.full);

  @Input() set proposalData(value: PcrV2State | null | undefined) {
    if (value) {
      this.proposal.set(value);
    }
  }

  @Input() set pcrId(value: number | string | null | undefined) {
    const inputId = Number(value);
    const routeId = getRouteProposalId(this.route);
    const id = value && Number.isFinite(inputId) && inputId > 0 ? inputId : routeId;

    if (!id || !Number.isFinite(id) || id <= 0) {
      this.loadToken++;
      this.summary.set(null);
      this.proposal.set(null);
      this.errorMessage.set('');
      this.loading.set(false);
      return;
    }

    void this.loadData(id);
  }

  readonly customerLabel = computed(() => {
    const customer = this.proposal()?.customer;
    const companyName = (customer as { companyName?: string | null } | undefined)?.companyName;
    const name = customer?.corporateName?.trim() || companyName?.trim() || this.emptyDisplay;
    const cnpj = customer?.cnpj?.trim();

    return cnpj ? `${name} | ${formatCNPJ(cnpj)}` : name;
  });

  readonly businessTypeLabel = computed(() => {
    const purposeId = this.proposal()?.proposal?.purpose;
    if (!purposeId) return this.emptyDisplay;

    return this.purposes().find(purpose => purpose.purposeId === purposeId)?.description ?? this.emptyDisplay;
  });

  readonly proposalTypeLabel = computed(() => {
    const proposal = this.proposal()?.proposal as { proposalType?: { description?: string } | string } | undefined;
    const proposalType = proposal?.proposalType;

    if (typeof proposalType === 'string' && proposalType.trim()) {
      return proposalType.trim();
    }

    if (proposalType && typeof proposalType === 'object' && proposalType.description?.trim()) {
      return proposalType.description.trim();
    }

    const proposalTypeId = this.proposal()?.proposal?.proposalTypeId;
    if (proposalTypeId == null) return this.emptyDisplay;

    return this.proposalTypes().find(type => type.proposalTypeId === proposalTypeId)?.description ?? this.emptyDisplay;
  });

  readonly proposalTypeBadge = computed<{ icon: string; label: string; tone: string }>(() => {
    const normalize = (value: string) =>
      value
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .trim();

    const text = `${normalize(this.businessTypeLabel())} ${normalize(this.proposalTypeLabel())}`;
    const types = this.labels.proposalTypes;

    if (text.includes('greenfield')) {
      return { icon: 'pi-sun', label: types.greenfield, tone: 'greenfield' };
    }
    if (text.includes('bandeira')) {
      return { icon: 'pi-flag', label: types.flagSwap, tone: 'flagSwap' };
    }
    if (text.includes('renova')) {
      return { icon: 'pi-refresh', label: types.renewal, tone: 'renewal' };
    }
    if (text.includes('recaptu')) {
      return { icon: 'pi-replay', label: types.recapture, tone: 'recapture' };
    }
    if (text.includes('novo negocio')) {
      return { icon: 'pi-briefcase', label: types.newBusiness, tone: 'newBusiness' };
    }
    return { icon: 'pi-tag', label: this.businessTypeLabel(), tone: 'default' };
  });

  readonly proposalTypeIcon = computed(() => this.proposalTypeBadge().icon);

  readonly isGreenfieldOrNewBusiness = computed(() => {
    const tone = this.proposalTypeBadge().tone;
    return tone === 'greenfield' || tone === 'newBusiness';
  });

  readonly isRenewal = computed(() => this.proposalTypeBadge().tone === 'renewal');

  readonly businessNatureBadge = computed<{ icon: string; label: string; tone: string } | null>(() => {
    const normalize = (value: string) =>
      value
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .trim();

    const text = `${normalize(this.businessTypeLabel())} ${normalize(this.proposalTypeLabel())}`;
    const types = this.labels.proposalTypes;

    if (text.includes('renova')) {
      return { icon: 'pi-refresh', label: types.renewal, tone: 'renewal' };
    }
    if (text.includes('novo negocio')) {
      return { icon: 'pi-briefcase', label: types.newBusiness, tone: 'newBusiness' };
    }
    return null;
  });

  readonly pcrCodeLabel = computed(() => {
    const aleCode = (this.proposal() as { pcrAleCode?: string | null } | null)?.pcrAleCode?.trim();
    if (aleCode) return aleCode;

    const id = this.summary()?.pcrId ?? this.proposal()?.id;
    return id ? String(id) : this.emptyDisplay;
  });

  readonly cityStateLabel = computed(() => {
    const summaryCustomer = this.summary()?.customer;
    const proposalCustomer = this.proposal()?.customer;
    const city = summaryCustomer?.city?.trim() || proposalCustomer?.city?.trim();
    const proposalState = (proposalCustomer as { state?: string | null; uf?: string | null } | undefined);
    const state = summaryCustomer?.state?.trim() || proposalState?.state?.trim() || proposalState?.uf?.trim();

    if (city && state) return `${city} / ${state}`;
    return city || state || this.emptyDisplay;
  });

  readonly contractPeriodLabel = computed(() => {
    const start = this.contractStartDateLabel();
    const end = this.contractEndDateLabel();

    if (start === this.emptyDisplay && end === this.emptyDisplay) return this.emptyDisplay;
    return `${start} a ${end}`;
  });

  readonly contractStartDateLabel = computed(() =>
    this.formatDate(this.summary()?.startDate ?? this.proposal()?.term?.startDate),
  );

  readonly contractEndDateLabel = computed(() =>
    this.formatDate(this.summary()?.endDate ?? this.proposal()?.term?.endDate),
  );

  readonly contractTermLabel = computed(() => {
    const months = this.finiteOrNull(this.summary()?.contractTermMonths)
      ?? this.finiteOrNull(this.proposal()?.term?.durationMonths);

    if (months == null) return this.emptyDisplay;
    return `${this.formatNumber(months)} meses`;
  });

  readonly responsibleLabel = computed(() => {
    const customer = this.summary()?.customer;
    return this.formatPersonWithSap(customer?.consultant, customer?.sapCodeConsultant);
  });

  readonly vmmItems = computed<IProposalSummaryContextItem[]>(() => {
    const summary = this.summary();
    const labels = this.labels.context;
    const tone = this.proposalTypeBadge().tone;

    if (tone === 'flagSwap') {
      return [
        {
          key: 'estimatedVmm',
          icon: 'pi-box',
          label: labels.estimatedVmm,
          value: this.formatM3(summary?.estimatedVmmM3),
        },
      ];
    }

    if (tone === 'renewal') {
      return [
        {
          key: 'realizedVmm',
          icon: 'pi-box',
          label: labels.realizedVmmM3,
          value: this.formatM3(summary?.realizedVmmM3),
        },
        {
          key: 'estimatedVmm',
          icon: 'pi-box',
          label: labels.estimatedVmm,
          value: this.formatM3(summary?.estimatedVmmM3),
        },
      ];
    }

    if (tone === 'greenfield') {
      return [
        {
          key: 'pvpVmm',
          icon: 'pi-box',
          label: labels.pvpVmm,
          value: this.formatM3(this.pvpPotentialVmm()),
        },
        {
          key: 'estimatedVmm',
          icon: 'pi-box',
          label: labels.estimatedVmm,
          value: this.formatM3(this.proposalMonthlyVmm()),
        },
      ];
    }

    if (tone === 'newBusiness') {
      return [
        {
          key: 'monthlyProposalVolume',
          icon: 'pi-box',
          label: labels.proposalVmm,
          value: this.formatM3(summary?.monthlyProposalVmmM3),
        },
      ];
    }

    return [
      {
        key: 'monthlyProposalVolume',
        icon: 'pi-box',
        label: labels.monthlyVmm,
        value: this.formatM3(summary?.monthlyProposalVmmM3),
      },
    ];
  });

  readonly contextItems = computed<IProposalSummaryContextItem[]>(() => {
    const summary = this.summary();
    const labels = this.labels.context;

    const items: IProposalSummaryContextItem[] = [
      {
        key: 'sapCenter',
        icon: 'pi-warehouse',
        label: labels.sapCenter,
        value: this.formatText(summary?.customer?.branch),
      },
      { key: 'sapCode', icon: 'pi-id-card', label: labels.sapCode, value: this.formatText(summary?.sapCode) },
      {
        key: 'startDate',
        icon: 'pi-calendar-plus',
        label: labels.startDate,
        value: this.contractStartDateLabel(),
      },
      {
        key: 'endDate',
        icon: 'pi-calendar-times',
        label: labels.endDate,
        value: this.contractEndDateLabel(),
      },
      { key: 'contractTermMonths', icon: 'pi-clock', label: labels.term, value: this.contractTermLabel() },
      ...this.vmmItems(),
    ];

    if (this.showResponsibleSignal()) {
      items.push({
        key: 'responsible',
        icon: 'pi-user',
        label: labels.responsible,
        value: this.responsibleLabel(),
      });
    }

    return items;
  });

  readonly minimalContextItems = computed<IProposalSummaryContextItem[]>(() => {
    const proposal = this.proposal();
    const labels = this.labels.minimal;
    const contextLabels = this.labels.context;

    return [
      {
        key: 'situation',
        icon: 'pi-info-circle',
        label: labels.situation,
        value: this.formatText(proposal?.proposal?.situation?.description),
      },
      {
        key: 'startDate',
        icon: 'pi-calendar-plus',
        label: contextLabels.startDate,
        value: this.contractStartDateLabel(),
      },
      {
        key: 'endDate',
        icon: 'pi-calendar-times',
        label: contextLabels.endDate,
        value: this.contractEndDateLabel(),
      },
      {
        key: 'rn',
        icon: 'pi-user',
        label: labels.rn,
        value: this.formatText(proposal?.commercial?.rn),
      },
      {
        key: 'directorship',
        icon: 'pi-sitemap',
        label: labels.directorship,
        value: this.formatText(proposal?.commercial?.directorship),
      },
    ];
  });

  readonly displayContextItems = computed<IProposalSummaryContextItem[]>(() =>
    (this.isMinimal() ? this.minimalContextItems() : this.contextItems())
      .filter(item => !this.hiddenOverviewFieldKeysSignal().includes(item.key)),
  );

  readonly structureNodes = computed<IProposalStructureNode[]>(() => {
    const customer = this.summary()?.customer;
    const labels = this.labels.structure;

    return [
      {
        icon: 'pi-sitemap',
        label: labels.directorship,
        value: this.formatText(customer?.director),
      },
      {
        icon: 'pi-user-edit',
        label: labels.commercialManager,
        value: this.formatText( customer?.manager),
      },
      {
        icon: 'pi-user',
        label: labels.consultant,
        value: this.formatText(customer?.consultant),
      },
    ];
  });

  readonly structureTags = computed<IProposalStructureTag[]>(() => {
    const commercial = this.proposal()?.commercial;
    const labels = this.labels.structure;

    return [
      { icon: 'pi-building', label: labels.group, value: this.formatText(commercial?.group) },
      { icon: 'pi-tags', label: labels.segment, value: this.formatText(commercial?.segment) },
      { icon: 'pi-bookmark', label: labels.subsegment, value: this.formatText(commercial?.subsegment) },
    ];
  });

  readonly commercialContextItems = computed<IProposalCommercialContextItem[]>(() => {
    const summaryContract = this.summary()?.currentContract;
    const proposalContract = this.proposal()?.contract;
    const retail = this.proposal()?.retail;
    const labels = this.labels.commercialContext;
    const joinStore = retail?.joinStore ?? null;
    const joinAleExpress = retail?.joinAleExpress ?? null;
    const lubricants = proposalContract?.lubricants ?? summaryContract?.lubricants;
    const registeredGuarantees = proposalContract?.registeredGuarantees ?? summaryContract?.registeredGuarantees;

    return [
      {
        key: 'store',
        icon: 'pi-shop',
        label: labels.store,
        value: this.formatBoolean(joinStore),
        badge: this.toBadge(joinStore),
      },
      {
        key: 'aleExpress',
        icon: 'pi-bolt',
        label: labels.aleExpress,
        value: this.formatBoolean(joinAleExpress),
        badge: this.toBadge(joinAleExpress),
      },
      {
        key: 'lubricants',
        icon: 'pi-cog',
        label: labels.lubricants,
        value: this.formatBoolean(lubricants),
        badge: this.toBadge(lubricants),
      },
      {
        key: 'registeredGuarantees',
        icon: 'pi-shield',
        label: labels.registeredGuarantees,
        value: this.formatBoolean(registeredGuarantees),
        badge: this.toBadge(registeredGuarantees),
      },
    ];
  });

  readonly displayCommercialContextItems = computed<IProposalCommercialContextItem[]>(() => {
    const hidden = new Set(this.hiddenCommercialContextFieldKeysSignal());
    return this.commercialContextItems().filter(item => !hidden.has(item.key));
  });

  readonly alertItems = computed<IProposalAlertItem[]>(() => {
    const proposal = this.proposal();
    const labels = this.labels.alerts;
    const exception = proposal?.requestException ?? null;
    const pendingVolume = proposal?.contract?.pendingVolume ?? null;
    const hasPendingVolume = pendingVolume != null && pendingVolume > 0;
    const hasPvpFiles = (proposal?.pvp?.files?.length ?? 0) > 0;

    const items: IProposalAlertItem[] = [
      {
        icon: 'pi-exclamation-triangle',
        label: labels.commercialException,
        value: this.formatBoolean(exception),
        tone: exception === true ? 'negative' : exception === false ? 'positive' : 'neutral',
      },
    ];

    if (this.isRenewal()) {
      items.push({
        icon: 'pi-file',
        label: labels.pendingVolumeContract,
        value: pendingVolume != null ? this.formatM3(pendingVolume) : labels.notInformed,
        tone: hasPendingVolume ? 'negative' : pendingVolume === 0 ? 'positive' : 'neutral',
      });
    }

    if (this.isGreenfieldOrNewBusiness()) {
      items.push({
        icon: 'pi-paperclip',
        label: labels.pvpAttached,
        value: this.formatBoolean(hasPvpFiles),
        tone: 'neutral',
      });
    }

    return items;
  });

  readonly highlights = computed<IProposalHighlight[]>(() => {
    const summary = this.summary();
    const labels = this.labels.highlights;

    const concessionTotal = summary?.concessionTotal?.total ?? null;

    return [
      {
        icon: 'pi-box',
        label: labels.totalVolume,
        value: this.formatM3(this.displayTotalVolumeM3()),
        caption: this.contractTermLabel(),
        tone: 'volume',
      },
      {
        icon: 'pi-gift',
        label: labels.concessionTotal,
        value: this.formatCurrency(concessionTotal),
        caption: this.formatAmountPerM3(summary?.concessionTotal ?? null) + ' /m³',
        tone: 'concession',
      },
      {
        icon: 'pi-chart-line',
        label: labels.totalUnitMargin,
        value: this.formatNumber(summary?.totalUnitMargin),
        caption: '',
        tone: 'margin',
      },
    ];
  });

  readonly overviewRows = computed<IProposalSummaryDetailRow[]>(() => {
    const summary = this.summary();
    const labels = this.labels.overview;

    return [
      { key: 'businessType', label: labels.businessType, value: this.businessTypeLabel() },
      { key: 'startDate', label: labels.startDate, value: this.contractStartDateLabel() },
      { key: 'endDate', label: labels.endDate, value: this.contractEndDateLabel() },
      { key: 'totalVolume', label: labels.totalVolume, value: this.formatM3(this.displayTotalVolumeM3()) },
      { key: 'realizedVmm', label: labels.realizedVmm, value: this.formatM3(summary?.realizedVmmM3) },
      { key: 'estimatedVmm', label: labels.estimatedVmm, value: this.formatM3(this.isGreenfield() ? this.proposalMonthlyVmm() : summary?.estimatedVmmM3) },
      { key: 'totalUnitMargin', label: labels.totalUnitMargin, value: this.formatCurrency(summary?.totalUnitMargin) },
      {
        key: 'maturationCurve',
        label: labels.maturationCurve,
        value: this.formatBoolean(summary?.hasMaturationCurve),
        badge: this.toBadge(summary?.hasMaturationCurve),
      },
    ];
  });

  readonly displayOverviewRows = computed<IProposalSummaryDetailRow[]>(() => {
    const hidden = new Set(this.hiddenOverviewFieldKeysSignal());
    return this.overviewRows().filter(row => !row.key || !hidden.has(row.key));
  });

  readonly creditStats = computed<IProposalStat[]>(() => {
    const labels = this.labels.creditIndicators;
    const financialHealth = this.customerFinancialHealth();

    if (financialHealth) {
      return [
        {
          icon: 'pi-star',
          label: labels.riskClass,
          value: this.formatCreditRiskClass(financialHealth),
        },
        {
          icon: 'pi-wallet',
          label: labels.creditLimit,
          value: this.formatCurrency(this.financialHealthCreditLimit(financialHealth)),
        },
        {
          icon: 'pi-percentage',
          label: labels.limitUtilization,
          value: this.formatPercentValue(this.financialHealthLimitUtilization(financialHealth)),
        },
        {
          icon: 'pi-lock',
          label: labels.accountBlocked,
          value: this.formatBlockedStatus(financialHealth.creditAccountIsBlocked),
        },
      ];
    }

    const indicators = this.summary()?.creditIndicators;

    const items: IProposalStat[] = [
      { icon: 'pi-percentage', label: labels.punctuality, value: this.formatText(indicators?.punctuality) },
      { icon: 'pi-verified', label: labels.integrity, value: this.formatText(indicators?.integrity) },
      { icon: 'pi-bolt', label: labels.energy, value: this.formatText(indicators?.energy) },
    ];

    if (this.showSerasaRatingSignal()) {
      items.unshift({
        icon: 'pi-star',
        label: labels.serasaRating,
        value: this.formatText(indicators?.serasaRating),
      });
    }

    return items;
  });

  readonly currentContractRows = computed<IProposalSummaryDetailRow[]>(() => {
    const contract = this.proposal()?.contract;
    const labels = this.labels.currentContract;
    const averageVolume = this.finiteOrNull(contract?.averageVolume12Months)
      ?? this.finiteOrNull(contract?.averageAleVolume);

    return [
      { key: 'contractStatus', label: labels.contractStatus, value: this.formatText(contract?.contractStatus) },
      { key: 'contractType', label: labels.contractType, value: this.formatText(contract?.contractType) },
      { key: 'averageVolume12Months', label: labels.averageVolume12Months, value: this.formatM3(averageVolume) },
      { key: 'estimatedEndDate', label: labels.estimatedEndDate, value: this.formatDate(contract?.estimatedEndDate) },
      { key: 'pendingVolume', label: labels.pendingVolume, value: this.formatM3(contract?.pendingVolume) },
      {
        key: 'hasPendingVolumeToConsider',
        label: labels.hasPendingVolumeToConsider,
        value: contractPendingVolumeConsideration(contract),
      },
    ];
  });

  readonly customerAddressLine = computed(() => {
    const customer = this.summary()?.customer;
    const parts = [customer?.address?.trim(), this.cityStateLabel() !== this.emptyDisplay ? this.cityStateLabel() : null]
      .filter((part): part is string => !!part);

    return parts.length ? parts.join(' · ') : this.emptyDisplay;
  });

  readonly customerContacts = computed<IProposalContact[]>(() => {
    const customer = this.summary()?.customer;
    const labels = this.labels.customer;

    return [
      {
        icon: 'pi-user-edit',
        role: labels.manager,
        name: this.formatPersonWithSap(customer?.manager, customer?.sapCodeManager),
      },
      {
        icon: 'pi-user',
        role: labels.consultant,
        name: this.formatPersonWithSap(customer?.consultant, customer?.sapCodeConsultant),
      },
    ];
  });

  readonly customerRegistrations = computed<IProposalStat[]>(() => {
    const customer = this.summary()?.customer;
    const commercial = this.proposal()?.commercial;
    const stateCustomer = this.proposal()?.customer;
    const labels = this.labels.customer;

    const items: IProposalStat[] = [
      { icon: 'pi-map', label: labels.zipCode, value: this.formatText(customer?.zipCode) },
      { icon: 'pi-id-card', label: labels.municipalRegistration, value: this.formatText(customer?.municipalRegistration) },
      { icon: 'pi-id-card', label: labels.stateRegistration, value: this.formatText(customer?.stateRegistration) },
      { icon: 'pi-tag', label: labels.classification, value: this.formatText(customer?.classification) },
      { icon: 'pi-truck', label: labels.freightType, value: this.formatText(customer?.freightType ?? stateCustomer?.incoterm) },
    ];

    if (this.showCustomerSegmentationSignal()) {
      items.push(
        { icon: 'pi-sitemap', label: labels.group, value: this.formatText(customer?.group ?? commercial?.group) },
        { icon: 'pi-th-large', label: labels.segment, value: this.formatText(customer?.segment ?? commercial?.segment) },
        { icon: 'pi-list', label: labels.subsegment, value: this.formatText(customer?.subsegment ?? commercial?.subsegment) },
      );
    }

    return items;
  });

  readonly approvedSimulationAllRows = computed<IProposalSummaryDetailRow[]>(() => {
    const simulation = this.summary()?.approvedSimulation;
    if (!simulation) return [];

    const labels = this.labels.approvedSimulation;

    return [
      { key: 'scenarioType', label: labels.scenarioType, value: `${this.formatText(simulation.scenarioType)} - #${simulation.simulationId} ` },
      { key: 'contractTermMonths', label: labels.contractTermMonths, value: this.formatNumber(simulation.contractTermMonths) },
      { key: 'totalVolumeM3', label: labels.totalVolumeM3, value: this.formatM3(this.approvedSimulationTotalVolumeM3(simulation)) },
      { key: 'weightedMarginM3', label: labels.weightedMarginM3, value: this.formatCurrency(simulation.weightedMarginM3) },
      { key: 'irrPerYear', label: labels.irrPerYear, value: this.formatPercent(simulation.irrPerYear) },
      { key: 'npv', label: labels.npv, value: this.formatCurrency(simulation.npv) },
      { key: 'paybackMonths', label: labels.paybackMonths, value: this.formatNumber(simulation.paybackMonths) },
      { key: 'marginCommitment', label: labels.marginCommitment, value: this.formatPercent(simulation.marginCommitment) },
      { key: 'approvalLevel', label: labels.approvalLevel, value: this.formatText(simulation.approvalLevel) },
      { key: 'lostFundTotal', label: labels.lostFundTotal, value: this.formatCurrency(simulation.lostFundTotal) },
      { key: 'totalReturnable', label: labels.totalReturnable, value: this.formatCurrency(simulation.totalReturnable) },
      { key: 'monthlyReturnable', label: labels.monthlyReturnable, value: this.formatCurrency(simulation.monthlyReturnable) },
      { key: 'rebateValueM3', label: labels.rebateValueM3, value: this.formatCurrency(simulation.rebateValueM3) },
      { key: 'rebateValueMonth', label: labels.rebateValueMonth, value: this.formatCurrency(simulation.rebateValueMonth) },
      { key: 'rebateValueTotal', label: labels.rebateValueTotal, value: this.formatCurrency(simulation.rebateValueTotal) },
      { key: 'rebatePeriodicity', label: labels.rebatePeriodicity, value: this.formatText(simulation.rebatePeriodicity) },
      { key: 'cashPercentage', label: labels.cashPercentage, value: this.formatPercent(simulation.cashPercentage) },
      { key: 'requiredMarginIrr0', label: labels.requiredMarginIrr0, value: this.formatCurrency(simulation.requiredMarginIrr0) },
      { key: 'requiredMarginIrr15', label: labels.requiredMarginIrr15, value: this.formatCurrency(simulation.requiredMarginIrr15) },
      { key: 'requiredVolumeIrr0', label: labels.requiredVolumeIrr0, value: this.formatM3(simulation.requiredVolumeIrr0) },
      { key: 'requiredVolumeIrr15', label: labels.requiredVolumeIrr15, value: this.formatM3(simulation.requiredVolumeIrr15) },
    ];
  });

  readonly approvedSimulationMainRows = computed<IProposalSummaryDetailRow[]>(() => {
    const hidden = new Set(this.hiddenApprovalFieldKeysSignal());
    const tirKeys = new Set([
      'requiredMarginIrr0',
      'requiredMarginIrr15',
      'requiredVolumeIrr0',
      'requiredVolumeIrr15',
    ]);

    return this.approvedSimulationAllRows().filter(row => {
      if (!row.key || tirKeys.has(row.key)) return false;
      return !hidden.has(row.key);
    });
  });

  readonly approvedSimulationTirTargetRows = computed<IProposalSummaryDetailRow[]>(() =>
    this.approvedSimulationAllRows().filter(row =>
      row.key === 'requiredMarginIrr0'
      || row.key === 'requiredMarginIrr15'
      || row.key === 'requiredVolumeIrr0'
      || row.key === 'requiredVolumeIrr15',
    ),
  );

  readonly hasApprovedSimulation = computed(() =>
    !!this.summary()?.approvedSimulation
    && (this.approvedSimulationMainRows().length > 0 || this.approvedSimulationTirTargetRows().length > 0),
  );

  readonly investmentRows = computed<IProposalSummaryInvestmentRow[]>(() => {
    const summary = this.summary();
    const proposalAmounts = this.proposalInvestmentAmounts();

    const rows: IProposalSummaryInvestmentRow[] = [
      {
        key: 'concessionTotal',
        label: this.labels.investments.concessionTotal,
        amount: this.summaryAmountOrFallback(summary?.concessionTotal ?? null, proposalAmounts.concessionTotal),
      },
      {
        key: 'lostFund',
        label: this.labels.investments.lostFund,
        amount: this.summaryAmountOrFallback(summary?.lostFund ?? null, proposalAmounts.lostFund),
      },
      {
        key: 'returnableLoan',
        label: this.labels.investments.returnableLoan,
        amount: this.summaryAmountOrFallback(summary?.returnableLoan ?? null, proposalAmounts.returnableLoan),
      },
      {
        key: 'projectedRebate',
        label: this.labels.investments.projectedRebate,
        amount: this.summaryAmountOrFallback(summary?.projectedRebate ?? null, proposalAmounts.projectedRebate),
      },
      {
        key: 'image',
        label: this.labels.investments.image,
        amount: this.summaryAmountOrFallback(summary?.image ?? null, proposalAmounts.image),
      },
      {
        key: 'environmental',
        label: this.labels.investments.environmental,
        amount: this.summaryAmountOrFallback(summary?.environmental ?? null, proposalAmounts.environmental),
      },
      {
        key: 'retail',
        label: this.labels.investments.retail,
        amount: this.summaryAmountOrFallback(summary?.retail ?? null, proposalAmounts.retail),
      },
      {
        key: 'equipmentResidual',
        label: this.labels.investments.equipmentResidual,
        amount: this.summaryAmountOrFallback(summary?.equipmentResidual ?? null, proposalAmounts.equipmentResidual),
      },
      {
        key: 'legalCosts',
        label: this.labels.investments.legalCosts,
        amount: this.summaryAmountOrFallback(summary?.legalCosts ?? null, proposalAmounts.legalCosts),
      },
    ];

    return [...rows, ...this.additionalProposalInvestmentRows()];
  });

  readonly displayInvestmentRows = computed<IProposalSummaryInvestmentRow[]>(() => {
    const hidden = new Set(this.hiddenInvestmentFieldKeysSignal());
    return this.investmentRows().filter(row => !hidden.has(row.key));
  });

  readonly hasInvestmentRows = computed(() => this.displayInvestmentRows().length > 0);

  readonly hasContent = computed(() => !!this.proposal() || !!this.summary());

  private async loadData(pcrId: number): Promise<void> {
    const token = ++this.loadToken;
    this.loading.set(true);
    this.errorMessage.set('');
    this.summary.set(null);
    this.customerFinancialHealth.set(null);
    this.applyLocalProposalFallback(pcrId);

    try {
      const [summaryResult, proposalResult, purposesResult, proposalTypesResult] = await Promise.allSettled([
        firstValueFrom(this.proposalSummaryService.getByPcrId(pcrId)),
        firstValueFrom(this.pcrV2Service.commercialPropose.getOne(pcrId)),
        firstValueFrom(this.purposeService.getAll()),
        firstValueFrom(this.proposalTypeService.getAll()),
      ]);

      if (token !== this.loadToken) return;

      if (summaryResult.status === 'fulfilled') {
        this.summary.set(summaryResult.value);
      }

      if (proposalResult.status === 'fulfilled') {
        this.proposal.set(proposalResult.value);
      }

      if (purposesResult.status === 'fulfilled') {
        this.purposes.set(toArr(purposesResult.value));
      }

      if (proposalTypesResult.status === 'fulfilled') {
        this.proposalTypes.set(toArr(proposalTypesResult.value));
      }

      await this.loadCustomerFinancialHealth();

      if (!this.proposal() && !this.summary()) {
        this.errorMessage.set(this.messages.loadError);
      }
    } catch {
      if (token !== this.loadToken) return;
      this.summary.set(null);
      this.proposal.set(null);
      this.customerFinancialHealth.set(null);
      this.errorMessage.set(this.messages.loadError);
    } finally {
      if (token === this.loadToken) {
        this.loading.set(false);
      }
    }
  }

  formatAmountTotal(amount: ISummaryAmount | null): string {
    return this.formatCurrency(amount?.total);
  }

  formatAmountPerM3(amount: ISummaryAmount | null): string {
    return this.formatCurrency(amount?.perM3);
  }

  private applyLocalProposalFallback(pcrId: number): void {
    const localProposal = this.pcrV2Service.state();

    if (localProposal?.id === pcrId) {
      this.proposal.set(localProposal);
    }
  }

  private async loadCustomerFinancialHealth(): Promise<void> {
    const sapCode = this.customerSapCode();

    if (!sapCode) {
      this.customerFinancialHealth.set(null);
      return;
    }

    try {
      const records = await firstValueFrom(this.customerFinancialHealthService.getBySapCode(sapCode));
      this.customerFinancialHealth.set(this.pickFinancialHealthRecord(records));
    } catch {
      this.customerFinancialHealth.set(null);
    }
  }

  private customerSapCode(): string {
    return this.proposal()?.customer?.sapCode?.trim()
      || this.summary()?.sapCode?.trim()
      || this.summary()?.customer?.sapCode?.trim()
      || '';
  }

  private pickFinancialHealthRecord(records: CustomerFinancialHealth[]): CustomerFinancialHealth | null {
    if (!records.length) return null;

    return [...records].sort((a, b) => {
      const aTime = Date.parse(a.updateDateTime ?? '') || 0;
      const bTime = Date.parse(b.updateDateTime ?? '') || 0;
      return bTime - aTime;
    })[0] ?? null;
  }

  private formatCreditRiskClass(financialHealth: CustomerFinancialHealth): string {
    const code = financialHealth.creditRiskClass?.trim();
    const name = financialHealth.creditRiskClassName?.trim();

    if (code && name) return `${code} - ${name}`;
    return this.formatText(name || code);
  }

  private financialHealthCreditLimit(financialHealth: CustomerFinancialHealth): number | null {
    return this.finiteOrNull(financialHealth.customerCreditLimitAmount)
      ?? this.finiteOrNull(financialHealth.customerCreditLimitAmount1)
      ?? this.finiteOrNull(financialHealth.creditLimitCalculatedAmount)
      ?? this.finiteOrNull(financialHealth.creditLimitRequestedAmount);
  }

  private financialHealthLimitUtilization(financialHealth: CustomerFinancialHealth): number | null {
    return this.finiteOrNull(financialHealth.creditLimitUtilizationPercent)
      ?? this.finiteOrNull(financialHealth.creditLimitUtilizationAllPercent);
  }

  private formatBlockedStatus(value: string | null | undefined): string {
    const normalized = value?.trim().toUpperCase();

    if (!normalized) return this.emptyDisplay;
    if (['S', 'SIM', 'Y', 'YES', 'TRUE', '1', 'X'].includes(normalized)) return PCR_V2_BOOLEAN_LABELS.yes;
    if (['N', 'NAO', 'NÃO', 'NO', 'FALSE', '0'].includes(normalized)) return PCR_V2_BOOLEAN_LABELS.no;

    return value?.trim() || this.emptyDisplay;
  }

  private proposalInvestmentAmounts(): IProposalInvestmentAmounts {
    const proposal = this.proposal();
    const totalVolume = this.proposalTotalVolume();
    const empty: IProposalInvestmentAmounts = {
      concessionTotal: null,
      lostFund: null,
      returnableLoan: null,
      projectedRebate: null,
      image: null,
      environmental: null,
      retail: null,
      equipmentResidual: null,
      legalCosts: null,
    };

    if (!proposal) return empty;

    const lostFundTotal = this.finiteOrNull(proposal.concession?.totalLostFund);
    const returnableTotal = this.finiteOrNull(proposal.returnable?.totalReturnable);
    const projectedRebateTotal = this.finiteOrNull(proposal.concession?.totalRebate);
    const investmentTotal = this.proposalInvestmentTotal();
    const concessionTotal =
      (lostFundTotal ?? 0)
      + (returnableTotal ?? 0)
      + (projectedRebateTotal ?? 0)
      + investmentTotal;

    return {
      concessionTotal: this.toSummaryAmount(concessionTotal, null, totalVolume),
      lostFund: this.toSummaryAmount(lostFundTotal, proposal.concession?.lostFundPerM3, totalVolume),
      returnableLoan: this.toSummaryAmount(returnableTotal, proposal.returnable?.returnablePerM3, totalVolume),
      projectedRebate: this.toSummaryAmount(projectedRebateTotal, proposal.concession?.rebatePerM3, totalVolume),
      image: this.toSummaryAmount(
        imageInvestmentTotal(this.proposalInvestments()),
        null,
        totalVolume,
      ),
      environmental: this.toSummaryAmount(
        this.proposalInvestmentTotalByTypes([INVESTIMENT_LABELS[3]]),
        this.proposalInvestmentUnitValueByTypes([INVESTIMENT_LABELS[3]]),
        totalVolume,
      ),
      retail: this.toSummaryAmount(
        this.proposalInvestmentTotalByTypes([INVESTIMENT_LABELS[4]]),
        this.proposalInvestmentUnitValueByTypes([INVESTIMENT_LABELS[4]]),
        totalVolume,
      ),
      equipmentResidual: this.toSummaryAmount(
        this.proposalInvestmentTotalByTypes([INVESTIMENT_LABELS[5]]),
        this.proposalInvestmentUnitValueByTypes([INVESTIMENT_LABELS[5]]),
        totalVolume,
      ),
      legalCosts: this.toSummaryAmount(
        this.proposalInvestmentTotalByTypes([INVESTIMENT_LABELS[6]]),
        this.proposalInvestmentUnitValueByTypes([INVESTIMENT_LABELS[6]]),
        totalVolume,
      ),
    };
  }

  private additionalProposalInvestmentRows(): IProposalSummaryInvestmentRow[] {
    const totalVolume = this.proposalTotalVolume();
    const knownTypes = new Set(INVESTIMENT_LABELS.map(type => normalizeLabel(type)));
    const totalsByType = new Map<string, { label: string; total: number }>();

    this.proposalInvestments().forEach(item => {
      const label = item.investmentType?.trim();
      if (!label || knownTypes.has(normalizeLabel(label))) return;

      const key = normalizeLabel(label);
      const current = totalsByType.get(key);
      const total = this.finiteOrNull(item.totalValue) ?? 0;

      totalsByType.set(key, {
        label: current?.label ?? label,
        total: (current?.total ?? 0) + total,
      });
    });

    return Array.from(totalsByType.entries()).map(([key, row]) => ({
      key: `additionalInvestment:${key}`,
      label: row.label,
      amount: this.toSummaryAmount(row.total, null, totalVolume),
    }));
  }

  private proposalInvestmentTotalByTypes(types: string[]): number {
    return investmentTotalByTypes(this.proposalInvestments(), types);
  }

  private proposalInvestmentUnitValueByTypes(types: string[]): number {
    return investmentUnitValueFromApiByTypes(this.proposalInvestments(), types);
  }

  private proposalInvestmentTotal(): number {
    return investmentGrandTotal(this.proposalInvestments());
  }

  private proposalInvestments(): NonNullable<PcrV2State['investments']> {
    const investments = this.proposal()?.investments;

    if (Array.isArray(investments)) {
      return investments;
    }

    return [];
  }

  private proposalTotalVolume(): number | null {
    const proposalVolume = this.localProposalTotalVolume();
    if (this.isGreenfield() && proposalVolume !== null) return proposalVolume;

    const greenfieldCurveVolume = this.greenfieldMaturationCurveTotalVolume();
    if (this.isGreenfield() && greenfieldCurveVolume !== null) return greenfieldCurveVolume;

    const summaryVolume = this.finiteOrNull(this.summary()?.totalVolumeM3);
    if (summaryVolume && summaryVolume > 0) return summaryVolume;

    if (proposalVolume !== null) return proposalVolume;

    const duration = this.finiteOrNull(this.proposal()?.term?.durationMonths);
    const monthly = this.proposalMonthlyVmm() ?? 0;

    if (monthly > 0 && duration && duration > 0) return monthly * duration;
    return monthly > 0 ? monthly : null;
  }

  private displayTotalVolumeM3(): number | null {
    return this.proposalTotalVolume();
  }

  private approvedSimulationTotalVolumeM3(simulation: ISummaryApprovedSimulation): number | null {
    const simulationVolume = this.finiteOrNull(simulation.totalVolumeM3);
    return simulationVolume && simulationVolume > 0
      ? simulationVolume
      : this.displayTotalVolumeM3();
  }

  private localProposalTotalVolume(): number | null {
    const total = (this.proposal()?.volumes ?? [])
      .reduce((sum, volume) => sum + (this.finiteOrNull(volume.proposalTotal) ?? 0), 0);

    return total > 0 ? total : null;
  }

  private greenfieldMaturationCurveTotalVolume(): number | null {
    const curve = this.proposal()?.pvp?.maturityCurve ?? [];
    const total = curve.reduce((sum, phase) => {
      const periodVolume = this.finiteOrNull(phase.periodVolume);
      if (periodVolume !== null) return sum + periodVolume;

      const monthlyVolume = this.finiteOrNull(phase.monthlyVolume ?? phase.volume);
      const duration = this.finiteOrNull(phase.durationMonths ?? phase.term);

      return monthlyVolume !== null && duration !== null && duration > 0
        ? sum + monthlyVolume * duration
        : sum;
    }, 0);

    return total > 0 ? total : null;
  }

  private proposalMonthlyVmm(): number | null {
    const total = (this.proposal()?.volumes ?? [])
      .reduce((sum, volume) => {
        const value =
          this.finiteOrNull(volume.proposalMonthly)
          ?? this.finiteOrNull(volume.estimatedMonthly)
          ?? 0;

        return sum + value;
      }, 0);

    return total > 0 ? total : null;
  }

  private pvpPotentialVmm(): number | null {
    const total = (this.proposal()?.volumes ?? [])
      .reduce((sum, volume) => sum + (this.finiteOrNull(volume.pvpPotentialMonthly) ?? 0), 0);

    return total > 0 ? total : null;
  }

  private isGreenfield(): boolean {
    return this.proposalTypeBadge().tone === 'greenfield';
  }

  private summaryAmountOrFallback(
    summaryAmount: ISummaryAmount | null,
    fallbackAmount: ISummaryAmount | null,
  ): ISummaryAmount | null {
    return this.hasSummaryAmount(summaryAmount) ? summaryAmount : fallbackAmount;
  }

  private hasSummaryAmount(amount: ISummaryAmount | null): amount is ISummaryAmount {
    return amount !== null
      && (this.finiteOrNull(amount.total) !== null || this.finiteOrNull(amount.perM3) !== null);
  }

  private toSummaryAmount(
    total: number | null | undefined,
    perM3: number | null | undefined,
    totalVolume: number | null,
  ): ISummaryAmount | null {
    const normalizedTotal = this.finiteOrNull(total);
    if (normalizedTotal === null) return null;

    return {
      total: normalizedTotal,
      perM3: this.finiteOrNull(perM3) ?? this.safeDivide(normalizedTotal, totalVolume),
    };
  }

  private safeDivide(value: number, divisor: number | null): number | null {
    if (!divisor || !Number.isFinite(divisor)) return null;
    return value / divisor;
  }

  private finiteOrNull(value: number | null | undefined): number | null {
    return value != null && Number.isFinite(value) ? value : null;
  }

  private formatBoolean(value: boolean | null | undefined): string {
    if (value === true) return PCR_V2_BOOLEAN_LABELS.yes;
    if (value === false) return PCR_V2_BOOLEAN_LABELS.no;
    return this.emptyDisplay;
  }

  private toBadge(value: boolean | null | undefined): 'yes' | 'no' | null {
    if (value === true) return 'yes';
    if (value === false) return 'no';
    return null;
  }

  private formatText(value: string | null | undefined): string {
    const text = value?.trim();
    return text ? text : this.emptyDisplay;
  }

  private formatPersonWithSap(name: string | null | undefined, sapCode: string | null | undefined): string {
    const personName = name?.trim();
    const code = sapCode?.trim();

    if (personName && code) return `${personName} (${code})`;
    if (personName) return personName;
    if (code) return code;
    return this.emptyDisplay;
  }

  private formatDate(value: Date | string | null | undefined): string {
    if (!value) return this.emptyDisplay;

    const date = value instanceof Date ? value : this.parseDateValue(value);
    if (Number.isNaN(date.getTime())) return this.emptyDisplay;

    return new Intl.DateTimeFormat('pt-BR').format(date);
  }

  private parseDateValue(value: string): Date {
    const text = value.trim();
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(text);

    if (dateOnly) {
      const [, year, month, day] = dateOnly;
      return new Date(Number(year), Number(month) - 1, Number(day));
    }

    return new Date(text);
  }

  private formatPercent(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) {
      return this.emptyDisplay;
    }

    return new Intl.NumberFormat('pt-BR', {
      style: 'percent',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }

  private formatPercentValue(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) {
      return this.emptyDisplay;
    }

    return new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value) + '%';
  }

  private formatCurrency(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) {
      return this.emptyDisplay;
    }

    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  }

  private formatM3(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) {
      return this.emptyDisplay;
    }

    return `${this.formatNumber(value)} m³`;
  }

  private formatNumber(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) {
      return this.emptyDisplay;
    }

    return new Intl.NumberFormat('pt-BR', {
      maximumFractionDigits: 2,
    }).format(value);
  }
}
