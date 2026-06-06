import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { AnimatedLoading } from '@actual-app/components/icons/AnimatedLoading';
import { SvgExpandArrow } from '@actual-app/components/icons/v0';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { Tooltip } from '@actual-app/components/tooltip';
import { View } from '@actual-app/components/view';
import * as monthUtils from '@actual-app/core/shared/months';
import { css, keyframes } from '@emotion/css';

import { CategoryAutocomplete } from '#components/autocomplete/CategoryAutocomplete';
import { CspCategoryAutocomplete } from '#components/autocomplete/CspCategoryAutocomplete';
import {
  Modal,
  ModalCloseButton,
  ModalHeader,
  ModalTitle,
} from '#components/common/Modal';
import { Checkbox } from '#components/forms';
import { useAICategorizeSession } from '#hooks/useAICategorizeSession';
import { useFormat } from '#hooks/useFormat';
import { SheetNameProvider } from '#hooks/useSheetName';
import type { Modal as ModalType } from '#modals/modalsSlice';

type AICategorizeReviewModalProps = Extract<
  ModalType,
  { name: 'ai-categorize-review' }
>['options'];

const shimmer = keyframes`
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
`;

const skeletonStyle = css`
  background: linear-gradient(
    90deg,
    ${theme.tableBorder} 25%,
    ${theme.tableBackground} 37%,
    ${theme.tableBorder} 63%
  );
  background-size: 200% 100%;
  animation: ${shimmer} 1.4s ease infinite;
`;

const pulse = keyframes`
  0% {
    transform: scale(0.8);
    opacity: 0.5;
  }
  100% {
    transform: scale(1.2);
    opacity: 1;
  }
`;

const dotStyle = (status: 'loaded' | 'loading' | 'pending') => css`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: ${status === 'loaded'
    ? theme.noticeTextLight
    : status === 'loading'
      ? theme.warningText
      : theme.tableBorder};
  transition: all 0.3s ease;
  ${status === 'loading' && `animation: ${pulse} 0.8s infinite alternate;`}
  ${status === 'loaded' &&
  `transform: scale(1.25); box-shadow: 0 0 6px ${theme.noticeTextLight};`}
`;

export function AICategorizeReviewModal(props: AICategorizeReviewModalProps) {
  const { t } = useTranslation();
  const format = useFormat();

  const bulk = 'bulk' in props ? (props.bulk ?? false) : false;
  const initialTransactionId =
    'transactionId' in props ? props.transactionId : undefined;

  const {
    preloadStatus,
    isLocalLoading,
    isSaving,
    savingProgress,
    error,
    currentTx,
    result,
    isAILoading,
    selectedStandardId,
    setSelectedStandardId,
    selectedCspId,
    setSelectedCspId,
    createRule,
    setCreateRule,
    applyToExisting,
    setApplyToExisting,
    conditionPayee,
    setConditionPayee,
    conditionAccount,
    setConditionAccount,
    ruleExpanded,
    setRuleExpanded,
    modifiedCategoryGroups,
    modifiedCspCategoryGroups,
    accounts,
    categories,
    cspCategories,
    initialTotal,
    remainingCount,
    currentProgress,
    showSuccess,
    skippedIds,
    handleAcceptAndNext,
    handleSkip,
    openRuleEditor,
  } = useAICategorizeSession({
    bulk,
    initialTransactionId,
  });

  let modalTitle = t('AI Categorization Review');
  if (bulk && initialTotal && initialTotal > 0 && remainingCount > 0) {
    modalTitle = t('AI Categorize All ({{current}} of {{total}})', {
      current: currentProgress,
      total: initialTotal,
    });
  }

  return (
    <Modal name="ai-categorize-review" isLoading={isLocalLoading}>
      {({ state }) => (
        <>
          <ModalHeader
            title={<ModalTitle title={modalTitle} shrinkOnOverflow />}
            rightContent={<ModalCloseButton onPress={() => state.close()} />}
          />
          <View
            style={{
              gap: 15,
              padding: 15,
              minWidth: 1200,
              width: 1200,
              position: 'relative',
            }}
          >
            {error ? (
              <Text style={{ color: theme.errorText }}>{error}</Text>
            ) : showSuccess ? (
              <View
                style={{
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '30px 10px',
                  gap: 15,
                }}
              >
                <Text style={{ fontSize: 40 }}>🎉</Text>
                <Text style={{ fontSize: 18, fontWeight: 600 }}>
                  {initialTotal === 0
                    ? t('No uncategorized transactions to process!')
                    : t('All uncategorized transactions processed!')}
                </Text>
                {initialTotal && initialTotal > 0 && skippedIds.size > 0 && (
                  <Text style={{ color: theme.pageTextLight, fontSize: 14 }}>
                    {t(
                      'Processed {{total}} transactions ({{skipped}} skipped).',
                      { total: initialTotal, skipped: skippedIds.size },
                    )}
                  </Text>
                )}
                <Button
                  variant="primary"
                  style={{ marginTop: 10 }}
                  onPress={() => state.close()}
                >
                  <Trans>Close</Trans>
                </Button>
              </View>
            ) : currentTx && (result || isAILoading) ? (
              <>
                {bulk && initialTotal && initialTotal > 0 && (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 5,
                    }}
                  >
                    <View
                      style={{
                        flex: 1,
                        height: 4,
                        backgroundColor: theme.tableBorder,
                        borderRadius: 2,
                        overflow: 'hidden',
                        marginRight: 15,
                      }}
                    >
                      <View
                        style={{
                          width: `${((currentProgress - 1) / initialTotal) * 100}%`,
                          height: '100%',
                          backgroundColor: theme.formInputTextHighlight,
                          transition: 'width 0.3s ease',
                        }}
                      />
                    </View>
                    {preloadStatus.length > 0 && (
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <Text
                          style={{ fontSize: 11, color: theme.pageTextLight }}
                        >
                          <Trans>AI Preload:</Trans>
                        </Text>
                        {preloadStatus.map((status, idx) => (
                          <Tooltip
                            key={idx}
                            content={
                              status === 'loaded'
                                ? t('Ready')
                                : status === 'loading'
                                  ? t('Loading...')
                                  : t('Pending')
                            }
                          >
                            <View className={dotStyle(status)} />
                          </Tooltip>
                        ))}
                      </View>
                    )}
                  </View>
                )}
                <View style={{ gap: 15 }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      backgroundColor: theme.tableBackground,
                      border: `1px solid ${theme.tableBorder}`,
                      borderRadius: 4,
                      borderLeft: `4px solid ${
                        isAILoading
                          ? theme.tableBorder
                          : result?.confidence === 'certain'
                            ? theme.noticeTextLight
                            : result?.confidence === 'confident'
                              ? theme.warningText
                              : theme.errorText
                      }`,
                      alignItems: 'center',
                      padding: '10px 15px',
                      gap: 15,
                    }}
                  >
                    <View style={{ flex: 1, minWidth: 80 }}>
                      <Text
                        style={{
                          color: theme.pageTextLight,
                          fontSize: 12,
                          marginBottom: 2,
                        }}
                      >
                        <Trans>Date</Trans>
                      </Text>
                      <Text>{currentTx.date}</Text>
                    </View>

                    <View style={{ flex: 2, minWidth: 120 }}>
                      <Text
                        style={{
                          color: theme.pageTextLight,
                          fontSize: 12,
                          marginBottom: 2,
                        }}
                      >
                        <Trans>Payee</Trans>
                      </Text>
                      <Tooltip
                        content={currentTx['payee.name'] || t('Unknown')}
                        triggerProps={{ isDisabled: !currentTx['payee.name'] }}
                      >
                        <Text
                          style={{
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {currentTx['payee.name'] || t('Unknown')}
                        </Text>
                      </Tooltip>
                    </View>

                    <View style={{ flex: 2, minWidth: 120 }}>
                      <Text
                        style={{
                          color: theme.pageTextLight,
                          fontSize: 12,
                          marginBottom: 2,
                        }}
                      >
                        <Trans>Account</Trans>
                      </Text>
                      <Tooltip
                        content={currentTx['account.name'] || ''}
                        triggerProps={{
                          isDisabled: !currentTx['account.name'],
                        }}
                      >
                        <Text
                          style={{
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {currentTx['account.name'] || '—'}
                        </Text>
                      </Tooltip>
                    </View>

                    {currentTx.notes ? (
                      <View style={{ flex: 2, minWidth: 100 }}>
                        <Text
                          style={{
                            color: theme.pageTextLight,
                            fontSize: 12,
                            marginBottom: 2,
                          }}
                        >
                          <Trans>Notes</Trans>
                        </Text>
                        <Tooltip content={currentTx.notes}>
                          <Text
                            style={{
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              color: theme.pageTextLight,
                              fontStyle: 'italic',
                            }}
                          >
                            {currentTx.notes}
                          </Text>
                        </Tooltip>
                      </View>
                    ) : null}

                    <View
                      style={{ flex: 1, minWidth: 80, alignItems: 'flex-end' }}
                    >
                      <Text
                        style={{
                          color: theme.pageTextLight,
                          fontSize: 12,
                          marginBottom: 2,
                        }}
                      >
                        <Trans>Amount</Trans>
                      </Text>
                      <Text>{format(currentTx.amount, 'financial')}</Text>
                    </View>

                    <View
                      style={{
                        width: 1,
                        height: 30,
                        backgroundColor: theme.tableBorder,
                        marginHorizontal: 5,
                      }}
                    />

                    <View style={{ flex: 2, minWidth: 150 }}>
                      <Text
                        style={{
                          color: theme.pageTextLight,
                          fontSize: 12,
                          marginBottom: 2,
                        }}
                      >
                        <Trans>Category</Trans>
                      </Text>
                      {isAILoading ? (
                        <View
                          className={skeletonStyle}
                          style={{ height: 28, borderRadius: 4 }}
                        />
                      ) : (
                        <SheetNameProvider
                          name={monthUtils.sheetForMonth(
                            monthUtils.monthFromDate(currentTx.date),
                          )}
                        >
                          <CategoryAutocomplete
                            categoryGroups={modifiedCategoryGroups}
                            value={selectedStandardId}
                            onSelect={id => setSelectedStandardId(id)}
                            showSplitOption={false}
                            updateOnValueChange
                            inputProps={{
                              placeholder: t('Select category...'),
                            }}
                          />
                        </SheetNameProvider>
                      )}
                    </View>

                    <View style={{ flex: 2, minWidth: 150 }}>
                      <Text
                        style={{
                          color: theme.pageTextLight,
                          fontSize: 12,
                          marginBottom: 2,
                        }}
                      >
                        {t('CSP Category')}
                      </Text>
                      {isAILoading ? (
                        <View
                          className={skeletonStyle}
                          style={{ height: 28, borderRadius: 4 }}
                        />
                      ) : (
                        <CspCategoryAutocomplete
                          categoryGroups={modifiedCspCategoryGroups}
                          value={selectedCspId}
                          onSelect={id => setSelectedCspId(id)}
                          updateOnValueChange
                          inputProps={{
                            placeholder: t('Select CSP category...'),
                          }}
                        />
                      )}
                    </View>
                  </View>

                  {isAILoading ? (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          color: theme.pageTextLight,
                          fontWeight: 600,
                        }}
                      >
                        <Trans>Reasoning</Trans>:
                      </Text>
                      <View
                        className={skeletonStyle}
                        style={{ flex: 1, height: 16, borderRadius: 4 }}
                      />
                    </View>
                  ) : (
                    <Text
                      style={{
                        fontSize: 13,
                        color: theme.pageTextLight,
                        fontStyle: 'italic',
                        wordBreak: 'break-word',
                        overflowWrap: 'break-word',
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>
                        <Trans>Reasoning</Trans>:
                      </span>{' '}
                      {result?.reasoning}
                    </Text>
                  )}

                  {isAILoading ? (
                    <View
                      className={skeletonStyle}
                      style={{ height: 44, borderRadius: 4 }}
                    />
                  ) : (
                    result && (
                      <View
                        style={{
                          backgroundColor: theme.pillBackgroundSelected,
                          borderRadius: 4,
                          overflow: 'hidden',
                        }}
                      >
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            padding: 10,
                            gap: 10,
                            cursor: 'pointer',
                            userSelect: 'none',
                          }}
                          onClick={() => setRuleExpanded(!ruleExpanded)}
                        >
                          <Checkbox
                            id="create-rule"
                            checked={createRule}
                            onChange={e => {
                              e.stopPropagation();
                              setCreateRule(e.target.checked);
                            }}
                          />
                          <View style={{ flex: 1 }}>
                            <label
                              htmlFor="create-rule"
                              style={{
                                fontWeight: 600,
                                userSelect: 'none',
                                cursor: 'pointer',
                              }}
                            >
                              ✨ <Trans>Create a rule for this payee</Trans>
                            </label>
                            <Text
                              style={{
                                fontSize: 12,
                                color: theme.pageTextLight,
                                marginTop: 2,
                              }}
                            >
                              <Trans>
                                Automatically categorize future transactions for
                              </Trans>{' '}
                              "{currentTx['payee.name']}"
                            </Text>
                          </View>
                          <SvgExpandArrow
                            style={{
                              width: 10,
                              height: 10,
                              color: theme.pageTextLight,
                              transform: ruleExpanded
                                ? 'rotate(0deg)'
                                : 'rotate(-90deg)',
                              transition: 'transform 0.15s ease',
                              flexShrink: 0,
                            }}
                          />
                        </View>

                        {ruleExpanded && (
                          <View
                            style={{
                              padding: '0 15px 15px 15px',
                              gap: 12,
                              borderTop: `1px solid ${theme.tableBorder}`,
                              paddingTop: 12,
                            }}
                          >
                            <View>
                              <Text
                                style={{
                                  fontWeight: 600,
                                  fontSize: 12,
                                  color: theme.pageTextLight,
                                  marginBottom: 6,
                                }}
                              >
                                <Trans>Conditions</Trans>
                              </Text>
                              <View
                                style={{
                                  backgroundColor: theme.tableBackground,
                                  border: `1px solid ${theme.tableBorder}`,
                                  borderRadius: 4,
                                  padding: '8px 12px',
                                  gap: 6,
                                }}
                              >
                                <View
                                  style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    gap: 8,
                                  }}
                                >
                                  <Checkbox
                                    id="cond-payee"
                                    checked={conditionPayee}
                                    onChange={e =>
                                      setConditionPayee(e.target.checked)
                                    }
                                  />
                                  <label
                                    htmlFor="cond-payee"
                                    style={{
                                      fontSize: 13,
                                      userSelect: 'none',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    {t('payee')} {t('is')} "
                                    <span style={{ fontStyle: 'italic' }}>
                                      {currentTx['payee.name']}
                                    </span>
                                    "
                                  </label>
                                </View>
                                <View
                                  style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    gap: 8,
                                  }}
                                >
                                  <Checkbox
                                    id="cond-account"
                                    checked={conditionAccount}
                                    onChange={e =>
                                      setConditionAccount(e.target.checked)
                                    }
                                  />
                                  <label
                                    htmlFor="cond-account"
                                    style={{
                                      fontSize: 13,
                                      userSelect: 'none',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    {t('account')} {t('is')} "
                                    <span style={{ fontStyle: 'italic' }}>
                                      {accounts.find(
                                        a => a.id === currentTx.account,
                                      )?.name ?? currentTx.account}
                                    </span>
                                    "
                                  </label>
                                </View>
                              </View>
                            </View>

                            <View>
                              <Text
                                style={{
                                  fontWeight: 600,
                                  fontSize: 12,
                                  color: theme.pageTextLight,
                                  marginBottom: 6,
                                }}
                              >
                                <Trans>Actions</Trans>
                              </Text>
                              <View
                                style={{
                                  backgroundColor: theme.tableBackground,
                                  border: `1px solid ${theme.tableBorder}`,
                                  borderRadius: 4,
                                  padding: '8px 12px',
                                  gap: 4,
                                }}
                              >
                                {selectedStandardId &&
                                  (() => {
                                    const cat = categories.find(
                                      c => c.id === selectedStandardId,
                                    );
                                    return (
                                      <Text style={{ fontSize: 13 }}>
                                        <Trans>Set</Trans>{' '}
                                        <span style={{ fontWeight: 600 }}>
                                          {t('category')}
                                        </span>{' '}
                                        {t('to')} "
                                        <span style={{ fontStyle: 'italic' }}>
                                          {selectedStandardId ===
                                          'new-standard-category-placeholder'
                                            ? `${result?.suggested_new_standard_category} (New)`
                                            : (cat?.name ?? selectedStandardId)}
                                        </span>
                                        "
                                      </Text>
                                    );
                                  })()}
                                {selectedCspId &&
                                  (() => {
                                    const cat = cspCategories.find(
                                      c => c.id === selectedCspId,
                                    );
                                    return (
                                      <Text style={{ fontSize: 13 }}>
                                        <Trans>Set</Trans>{' '}
                                        <span style={{ fontWeight: 600 }}>
                                          {t('CSP category')}
                                        </span>{' '}
                                        {t('to')} "
                                        <span style={{ fontStyle: 'italic' }}>
                                          {selectedCspId ===
                                          'new-csp-category-placeholder'
                                            ? `${result?.suggested_new_csp_category} (New)`
                                            : (cat?.name ?? selectedCspId)}
                                        </span>
                                        "
                                      </Text>
                                    );
                                  })()}
                                {!selectedStandardId && !selectedCspId && (
                                  <Text
                                    style={{
                                      fontSize: 13,
                                      color: theme.pageTextLight,
                                      fontStyle: 'italic',
                                    }}
                                  >
                                    {t(
                                      'No actions — select at least one category above',
                                    )}
                                  </Text>
                                )}
                              </View>
                            </View>

                            <Button
                              variant="bare"
                              style={{ alignSelf: 'flex-start', fontSize: 12 }}
                              onPress={openRuleEditor}
                            >
                              {t('Edit Rule...')}
                            </Button>

                            {createRule && (
                              <View
                                style={{
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  gap: 8,
                                }}
                              >
                                <Checkbox
                                  id="apply-to-existing"
                                  checked={applyToExisting}
                                  onChange={e =>
                                    setApplyToExisting(e.target.checked)
                                  }
                                />
                                <label
                                  htmlFor="apply-to-existing"
                                  style={{
                                    fontSize: 12,
                                    userSelect: 'none',
                                    cursor: 'pointer',
                                  }}
                                >
                                  <Trans>
                                    Also apply to existing uncategorized
                                    transactions matching these conditions
                                  </Trans>
                                </label>
                              </View>
                            )}
                          </View>
                        )}
                      </View>
                    )
                  )}

                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'flex-end',
                      gap: 10,
                      marginTop: 10,
                    }}
                  >
                    <Button onPress={() => state.close()}>
                      {bulk ? t('Stop / Close') : t('Cancel')}
                    </Button>
                    {bulk && (
                      <Button variant="normal" onPress={handleSkip}>
                        <Trans>Skip</Trans>
                      </Button>
                    )}
                    <Button
                      variant="primary"
                      isDisabled={isAILoading}
                      onPress={() => handleAcceptAndNext(() => state.close())}
                    >
                      {t('Accept & Save')}
                    </Button>
                  </View>
                </View>
              </>
            ) : null}

            {isSaving && (
              <View
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: theme.modalBackground,
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 1000,
                  gap: 15,
                  padding: 20,
                  borderRadius: 6,
                }}
              >
                <AnimatedLoading
                  style={{ width: 30, height: 30 }}
                  color={theme.pageText}
                />
                <Text style={{ fontWeight: 600, fontSize: 16 }}>
                  {savingProgress
                    ? t('Applying updates to existing transactions...')
                    : t('Saving changes...')}
                </Text>
                {savingProgress && (
                  <View style={{ width: '80%', alignItems: 'center', gap: 8 }}>
                    <View
                      style={{
                        width: '100%',
                        height: 8,
                        backgroundColor: theme.tableBorder,
                        borderRadius: 4,
                        overflow: 'hidden',
                      }}
                    >
                      <View
                        style={{
                          width: `${(savingProgress.current / savingProgress.total) * 100}%`,
                          height: '100%',
                          backgroundColor: theme.buttonPrimaryBackground,
                          transition: 'width 0.1s ease',
                        }}
                      />
                    </View>
                    <Text style={{ fontSize: 12, color: theme.pageTextLight }}>
                      {t('Updated {{current}} of {{total}} transactions', {
                        current: savingProgress.current,
                        total: savingProgress.total,
                      })}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>
        </>
      )}
    </Modal>
  );
}
